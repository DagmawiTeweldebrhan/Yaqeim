from __future__ import annotations

import contextlib
import io
import json
import tempfile
import unittest
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from yaqeim_ingest.cli import main
from yaqeim_ingest.extract import GeminiExtractor, validate_extraction
from yaqeim_ingest.import_db import import_reviews
from yaqeim_ingest.models import ImportedReview, RawPost, ValidationError, read_jsonl, redact_contacts, sentiment_to_rating, source_hash, write_jsonl
from yaqeim_ingest.scrape import ScrapeOptions, load_cookies, post_identity, scrape_posts, validate_group_url


def raw_post(**changes):
    values = {"source_id": "facebook:private-group:123", "body": "Professor Example taught CS-UH 1001, Example Course, clearly with a light workload.",
              "captured_at": "2026-01-01T12:00:00+00:00"}
    return RawPost.from_dict(values | changes)


def model_review(**changes):
    return {"professor_name": "Professor Example", "course_code": "CS-UH 1001",
            "course_title": "Example Course", "department": "Unspecified",
            "body": "The professor explained the material clearly and the workload was light.",
            "sentiment_score": 9, "workload_rating": None, "grading_difficulty": None,
            "tags": ["Light Workload"]} | changes


def review(**changes):
    item = validate_extraction(json.dumps({"reviews": [model_review()]}), raw_post())[0]
    return ImportedReview.from_dict(asdict(item) | changes)


class ValidationTests(unittest.TestCase):
    def test_all_sentiment_bins(self):
        self.assertEqual([sentiment_to_rating(x) for x in range(1, 11)], [1, 1, 2, 2, 3, 3, 4, 4, 5, 5])

    def test_invalid_sentiment_rejected(self):
        for value in [0, 11, 1.5, "9", True, None]:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                sentiment_to_rating(value)

    def test_unknown_numeric_ratings_stay_null(self):
        item = review()
        self.assertIsNone(item.workload_rating)
        self.assertIsNone(item.grading_difficulty)
        self.assertEqual(item.overall_rating, 5)

    def test_unknown_tags_and_duplicate_tags_rejected(self):
        for tags in [["Nice person"], ["Easy A", "Easy A"], [1], "Easy A"]:
            with self.subTest(tags=tags), self.assertRaises(ValidationError):
                review(tags=tags)

    def test_rating_boundaries_enforced(self):
        for value in [0, 6, 2.3, "4", False]:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                review(workload_rating=value)

    def test_hash_stable_across_whitespace_and_case(self):
        self.assertEqual(source_hash("post1", "  Professor   Example", "cs-uh 1001"),
                         source_hash("POST1", "professor example", "CS-UH 1001"))
        self.assertNotEqual(source_hash("post1", "A", "CS 1"), source_hash("post2", "A", "CS 1"))

    def test_contact_redaction(self):
        cleaned = redact_contacts("Email student@nyu.edu, message @student or +971 50 123 4567. See https://facebook.com/profile/1")
        self.assertNotIn("student@", cleaned)
        self.assertNotIn("@student", cleaned)
        self.assertNotIn("+971", cleaned)
        self.assertNotIn("https://", cleaned)

    def test_output_cannot_reintroduce_contact_details(self):
        with self.assertRaises(ValidationError):
            review(body="The course was great. Contact student@nyu.edu for more information.")

    def test_raw_metadata_and_naive_timestamp_rejected(self):
        with self.assertRaises(ValidationError):
            RawPost.from_dict(asdict(raw_post()) | {"author": "Private Person"})
        with self.assertRaises(ValidationError):
            raw_post(captured_at="2026-01-01T12:00:00")

    def test_professor_and_course_normalization(self):
        item = review(professor_name="  Professor   Example  ", course_code="  cs-uh   1001 ")
        self.assertEqual(item.professor_name, "Professor Example")
        self.assertEqual(item.course_code, "CS-UH 1001")

    def test_extraction_requires_exact_schema(self):
        for output in ["not JSON", "[]", '{"reviews": null}', json.dumps({"reviews": [model_review(author="Student")]}),
                       json.dumps({"reviews": [model_review(professor_name=123)]})]:
            with self.subTest(output=output), self.assertRaises(ValidationError):
                validate_extraction(output, raw_post())

    def test_no_review_is_a_valid_result(self):
        self.assertEqual(validate_extraction('{"reviews": []}', raw_post()), [])

    def test_duplicate_pairs_rejected(self):
        with self.assertRaises(ValidationError):
            validate_extraction(json.dumps({"reviews": [model_review(), model_review()]}), raw_post())

    def test_file_validation_reports_line_without_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.jsonl"
            path.write_text('{"private": "student@nyu.edu"}\n', encoding="utf-8")
            with self.assertRaisesRegex(ValidationError, "line 1") as context:
                list(read_jsonl(path, ImportedReview.from_dict))
            self.assertNotIn("student", str(context.exception))

    def test_file_round_trip_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.jsonl"
            self.assertEqual(write_jsonl(path, [review()]), 1)
            self.assertEqual(list(read_jsonl(path, ImportedReview.from_dict)), [review()])
            with self.assertRaises(FileExistsError):
                write_jsonl(path, [])


class ExtractionTests(unittest.TestCase):
    def test_retry_transient_failure_then_validate(self):
        calls, waits = [], []
        class TemporaryFailure(Exception):
            code = 429
        def generate(**kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                raise TemporaryFailure("private provider content")
            return SimpleNamespace(text=json.dumps({"reviews": [model_review()]}))
        extractor = GeminiExtractor("test-model", SimpleNamespace(models=SimpleNamespace(generate_content=generate)), waits.append)
        result = extractor.extract(raw_post(body="Student@nyu.edu says the course is excellent and easy to follow."))
        self.assertEqual(result[0].overall_rating, 5)
        self.assertEqual(waits, [1])
        self.assertNotIn("Student@nyu.edu", calls[0]["contents"])
        self.assertIn("system_instruction", calls[0]["config"])

    def test_provider_errors_do_not_expose_secrets(self):
        def generate(**kwargs):
            raise RuntimeError("secret-key student private post")
        extractor = GeminiExtractor("test-model", SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
        with self.assertRaises(ValidationError) as context:
            extractor.extract(raw_post())
        self.assertNotIn("secret-key", str(context.exception))

    def test_malformed_output_is_not_retried(self):
        calls = []
        def generate(**kwargs):
            calls.append(kwargs)
            return SimpleNamespace(text="bad data")
        extractor = GeminiExtractor("test-model", SimpleNamespace(models=SimpleNamespace(generate_content=generate)))
        with self.assertRaises(ValidationError):
            extractor.extract(raw_post())
        self.assertEqual(len(calls), 1)


class FakeConnection:
    def __init__(self):
        self.reviews = set()
        self.calls = []
        self.fail_on = None
        self.transactions = 0

    @contextlib.contextmanager
    def transaction(self):
        before = self.reviews.copy()
        self.transactions += 1
        try:
            yield
        except Exception:
            self.reviews = before
            raise

    @contextlib.contextmanager
    def cursor(self):
        yield self

    def execute(self, sql, parameters):
        self.calls.append((sql, parameters))
        if "public.reviews" in sql:
            fingerprint = parameters[7]
            if fingerprint == self.fail_on:
                raise RuntimeError("simulated database error")
            self.result = None if fingerprint in self.reviews else ("review-uuid",)
            self.reviews.add(fingerprint)
        else:
            self.result = ("entity-uuid",)

    def fetchone(self):
        return self.result


class ImportTests(unittest.TestCase):
    def test_idempotent_reruns(self):
        connection = FakeConnection()
        first = import_reviews(connection, [review()])
        second = import_reviews(connection, [review()])
        self.assertEqual((first.inserted, first.skipped), (1, 0))
        self.assertEqual((second.inserted, second.skipped), (0, 1))

    def test_parameters_not_sql_interpolation(self):
        connection = FakeConnection()
        item = review(professor_name="O'Reilly; DROP TABLE users;--")
        import_reviews(connection, [item])
        self.assertNotIn(item.professor_name, connection.calls[0][0])
        self.assertEqual(connection.calls[0][1][0], item.professor_name)

    def test_conflicting_hash_fails_before_writes(self):
        connection = FakeConnection()
        with self.assertRaises(ValidationError):
            import_reviews(connection, [review(), review(body="The changed review should not silently overwrite an existing source.")])
        self.assertEqual(connection.calls, [])

    def test_batch_rolls_back_on_database_failure(self):
        connection = FakeConnection()
        second = review(source_hash="b" * 64)
        connection.fail_on = second.source_hash
        with self.assertRaises(RuntimeError):
            import_reviews(connection, [review(), second], batch_size=100)
        self.assertEqual(connection.reviews, set())

    def test_import_provenance_and_unknown_ratings(self):
        connection = FakeConnection()
        import_reviews(connection, [review()])
        sql, parameters = connection.calls[-1]
        self.assertIn("NULL", sql)
        self.assertIn("true, true", sql)
        self.assertIsNone(parameters[4])
        self.assertIsNone(parameters[5])

    def test_cli_dry_run_has_no_database_dependency(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.jsonl"
            write_jsonl(path, [review()])
            with patch("yaqeim_ingest.cli.connect_database") as connect, contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(main(["import", "--input", str(path), "--dry-run"]), 0)
            connect.assert_not_called()
            self.assertEqual(json.loads(output.getvalue())["valid"], 1)

    def test_cli_requires_editorial_review_before_import(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.jsonl"
            write_jsonl(path, [review()])
            with patch("yaqeim_ingest.cli.connect_database") as connect, contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(main(["import", "--input", str(path)]), 1)
            connect.assert_not_called()

    def test_cli_dry_run_detects_conflicting_duplicate_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.jsonl"
            write_jsonl(path, [review(), review(overall_rating=1)])
            with contextlib.redirect_stderr(io.StringIO()) as output:
                self.assertEqual(main(["import", "--input", str(path), "--dry-run"]), 1)
            self.assertIn("Conflicting records", output.getvalue())


class ScraperTests(unittest.TestCase):
    def test_rejects_unrelated_hosts_and_credentials(self):
        for url in ["http://facebook.com/groups/123", "https://facebook.com.attacker.test/groups/123",
                    "https://user:password@facebook.com/groups/123", "https://facebook.com/profile/123"]:
            with self.subTest(url=url), self.assertRaises(ValidationError):
                validate_group_url(url)

    def test_cookie_filtering(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cookies.json"
            path.write_text(json.dumps([
                {"name": "c_user", "value": "private", "domain": ".facebook.com", "sameSite": "Lax", "extra": "ignored"},
                {"name": "foreign", "value": "secret", "domain": ".other.test"},
                {"name": "expired", "value": "secret", "domain": ".facebook.com", "expiry": 1},
            ]), encoding="utf-8")
            cookies = load_cookies(path)
            self.assertEqual(len(cookies), 1)
            self.assertNotIn("extra", cookies[0])

    def test_post_identity_drops_tracking_parameters(self):
        self.assertEqual(post_identity("https://www.facebook.com/groups/123/posts/456/?tracking=secret", "body", "https://facebook.com/groups/123"), "facebook:123:456")

    def test_fallback_identity_is_stable(self):
        self.assertEqual(post_identity("", "same  body", "https://facebook.com/groups/123"),
                         post_identity("", "same body", "https://facebook.com/groups/123/search/?q=professor"))

    def test_bounded_collection_and_body_only(self):
        class Element:
            text = "Clear lectures and a light workload in this course."
            def get_attribute(self, name):
                return "https://www.facebook.com/groups/123/posts/456/"
        class Article:
            def find_elements(self, by, selector):
                return [Element()]
        class Driver:
            current_url = "https://www.facebook.com/groups/123"
            scrolls = 0
            def set_page_load_timeout(self, seconds): pass
            def get(self, url): pass
            def add_cookie(self, cookie): pass
            def find_elements(self, by, selector): return [Article()]
            def execute_script(self, script): self.scrolls += 1
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "cookies.json"
            path.write_text('[{"name": "c_user", "value": "private"}]', encoding="utf-8")
            driver = Driver()
            options = ScrapeOptions(driver.current_url, path, max_scrolls=30, idle_rounds=2)
            records = list(scrape_posts(options, driver=driver, sleep=lambda _: None))
            self.assertEqual(len(records), 1)
            self.assertLessEqual(driver.scrolls, 3)
            self.assertEqual(records[0].source_id, "facebook:123:456")


if __name__ == "__main__":
    unittest.main()
