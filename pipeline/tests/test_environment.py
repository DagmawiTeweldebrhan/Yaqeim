import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from yaqeim_ingest.cli import main, parser
from yaqeim_ingest.environment import load_environment_file
from yaqeim_ingest.models import ValidationError
from yaqeim_ingest.scrape import resolve_group_url, session_cookies, validate_group_url


class ExplicitEnvironmentTests(unittest.TestCase):
    def test_file_load_preserves_process_secrets_and_literal_interpolation_characters(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"FB_XS": "existing-secret"}, clear=True):
            path = Path(directory) / "settings.env"
            path.write_text("FB_C_USER=123456\nFB_XS='file-secret'\nGEMINI_API_KEY='literal-${FB_XS}-$value'\nROR_GROUP_ID=12345\nGITHUB_TOKEN=unrelated-secret\n", encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()) as errors:
                load_environment_file(path)
            self.assertEqual(os.environ["FB_XS"], "existing-secret")
            self.assertEqual(os.environ["GEMINI_API_KEY"], "literal-${FB_XS}-$value")
            self.assertEqual(os.environ["FB_C_USER"], "123456")
            self.assertNotIn("GITHUB_TOKEN", os.environ)
            self.assertEqual(output.getvalue(), "")
            self.assertEqual(errors.getvalue(), "")

    def test_missing_env_file_error_does_not_disclose_path(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sensitive-filename.env"
            with self.assertRaises(ValidationError) as caught:
                load_environment_file(path)
            self.assertNotIn("sensitive-filename", str(caught.exception))

    def test_cli_never_loads_an_environment_file_implicitly(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.jsonl"
            path.write_text("", encoding="utf-8")
            with patch("yaqeim_ingest.cli.load_environment_file") as loader, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["validate", "--input", str(path)]), 0)
            loader.assert_not_called()

    def test_env_file_option_works_before_and_after_subcommand(self):
        before = parser().parse_args(["--env-file", "settings.env", "scrape", "--query", "professor", "--output", "test.jsonl"])
        after = parser().parse_args(["scrape", "--env-file", "settings.env", "--query", "professor", "--output", "test.jsonl"])
        self.assertEqual(before.env_file, Path("settings.env"))
        self.assertEqual(after.env_file, Path("settings.env"))

    def test_cli_env_loading_never_prints_secrets(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True):
            env_file = Path(directory) / "settings.env"
            env_file.write_text("FB_C_USER=123456\nFB_XS=synthetic-secret-cookie\nROR_GROUP_ID=12345\n", encoding="utf-8")
            output_file = Path(directory) / "posts.jsonl"
            with patch("yaqeim_ingest.cli.scrape_posts", return_value=iter([])) as scrape:
                with contextlib.redirect_stdout(io.StringIO()) as output, contextlib.redirect_stderr(io.StringIO()) as errors:
                    status = main(["--env-file", str(env_file), "scrape", "--query", "A Professor", "--output", str(output_file)])
            self.assertEqual(status, 0)
            self.assertEqual(json.loads(output.getvalue()), {"collected": 0})
            self.assertNotIn("synthetic-secret-cookie", output.getvalue() + errors.getvalue())
            self.assertIsNone(scrape.call_args.args[0].cookie_file)
            self.assertEqual(parse_qs(urlparse(scrape.call_args.args[0].url).query), {"q": ["A Professor"]})


class CookieEnvironmentTests(unittest.TestCase):
    def test_process_credentials_produce_only_facebook_session_cookies(self):
        with patch.dict(os.environ, {"FB_C_USER": "123456", "FB_XS": "synthetic%3Acookie$literal"}, clear=True):
            cookies = session_cookies(None)
        self.assertEqual({cookie["name"]: cookie["value"] for cookie in cookies}, {"c_user": "123456", "xs": "synthetic%3Acookie$literal"})
        self.assertTrue(all(cookie["secure"] and cookie["httpOnly"] for cookie in cookies))
        self.assertTrue(all(cookie["domain"] == ".facebook.com" for cookie in cookies))

    def test_both_process_cookies_are_required(self):
        for values in ({}, {"FB_C_USER": "123456"}, {"FB_XS": "synthetic-secret"}):
            with self.subTest(keys=sorted(values)), patch.dict(os.environ, values, clear=True):
                with self.assertRaisesRegex(ValidationError, "both FB_C_USER and FB_XS") as caught:
                    session_cookies(None)
                self.assertNotIn("synthetic-secret", str(caught.exception))

    def test_malformed_cookie_values_are_rejected_without_echoing(self):
        for key, bad in [("FB_C_USER", "secret-not-numeric"), ("FB_XS", "secret;extra=value"), ("FB_XS", "secret\nvalue")]:
            values = {"FB_C_USER": "123456", "FB_XS": "synthetic-secret", key: bad}
            with self.subTest(key=key), patch.dict(os.environ, values, clear=True), self.assertRaises(ValidationError) as caught:
                session_cookies(None)
            self.assertNotIn(bad, str(caught.exception))

    def test_explicit_cookie_file_takes_precedence_without_requiring_process_credentials(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"FB_C_USER": "invalid", "FB_XS": "ignored"}, clear=True):
            path = Path(directory) / "cookies.json"
            path.write_text('[{"name":"c_user","value":"654321","domain":".facebook.com"}]', encoding="utf-8")
            self.assertEqual(session_cookies(path)[0]["value"], "654321")

    def test_bad_explicit_cookie_file_does_not_silently_fall_back(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"FB_C_USER": "123456", "FB_XS": "valid-synthetic-secret"}, clear=True):
            with self.assertRaises(ValidationError):
                session_cookies(Path(directory) / "missing.json")

    def test_cli_reports_missing_cookies_without_starting_browser(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"ROR_GROUP_ID": "12345"}, clear=True):
            with contextlib.redirect_stderr(io.StringIO()) as errors:
                result = main(["scrape", "--query", "Professor", "--output", str(Path(directory) / "posts.jsonl")])
            self.assertEqual(result, 1)
            self.assertIn("both FB_C_USER and FB_XS", errors.getvalue())


class GroupConfigurationTests(unittest.TestCase):
    def test_search_query_is_required_and_encoded_as_data(self):
        with patch.dict(os.environ, {"ROR_GROUP_ID": "12345"}, clear=True):
            url = resolve_group_url(None, "Professor A & B / topics?")
        parsed = urlparse(url)
        self.assertEqual(parsed.netloc, "www.facebook.com")
        self.assertEqual(parsed.path, "/groups/12345/search/")
        self.assertEqual(parse_qs(parsed.query), {"q": ["Professor A & B / topics?"]})

    def test_missing_and_invalid_group_ids_cannot_escape_the_group_path(self):
        for group in ["", ".", "..", "123/../../login", "https://evil.example", "123?evil=1", "group\nsecret", "x" * 101]:
            with self.subTest(group=group), patch.dict(os.environ, {"ROR_GROUP_ID": group}, clear=True):
                with self.assertRaises(ValidationError):
                    resolve_group_url(None, "Professor")

    def test_group_slugs_and_numeric_ids_are_supported(self):
        for group in ["123456789", "room-of-requirement", "room.of_requirement"]:
            with self.subTest(group=group), patch.dict(os.environ, {"ROR_GROUP_ID": group}, clear=True):
                self.assertIn(f"/groups/{group}/search/", resolve_group_url(None, "Professor"))

    def test_environment_group_id_alone_never_starts_unbounded_collection(self):
        with patch.dict(os.environ, {"ROR_GROUP_ID": "12345"}, clear=True):
            for query in [None, "", "   ", "x" * 201, "Professor\nsecret"]:
                with self.subTest(query=query), self.assertRaises(ValidationError):
                    resolve_group_url(None, query)

    def test_existing_explicit_url_and_cookie_cli_remain_supported(self):
        url = "https://www.facebook.com/groups/12345/search/?q=Professor"
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(resolve_group_url(url, None), url)
        parsed = parser().parse_args(["scrape", "--url", url, "--cookies", "cookies.json", "--output", "posts.jsonl"])
        self.assertEqual(parsed.cookies, Path("cookies.json"))

    def test_ambiguous_url_and_query_combination_is_rejected(self):
        with self.assertRaises(ValidationError):
            resolve_group_url("https://facebook.com/groups/12345", "different query")

    def test_explicit_url_cannot_use_dot_segments_or_controls(self):
        for url in ["https://facebook.com/groups/../search", "https://facebook.com/groups/123\t45", "https://facebook.com:invalid/groups/12345"]:
            with self.subTest(url=url), self.assertRaises(ValidationError):
                validate_group_url(url)


if __name__ == "__main__":
    unittest.main()
