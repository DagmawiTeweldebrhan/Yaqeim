"""Parameterized, idempotent batch imports into the reviewed database schema."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from .models import ImportedReview, ValidationError, validate_import_records

PROFESSOR_SQL = """
INSERT INTO public.professors (full_name, department)
VALUES (%s, %s)
ON CONFLICT (lower(btrim(full_name)))
DO UPDATE SET full_name = professors.full_name
RETURNING id
"""
COURSE_SQL = """
INSERT INTO public.courses (code, title, department)
VALUES (%s, %s, %s)
ON CONFLICT (lower(btrim(code)))
DO UPDATE SET code = courses.code
RETURNING id
"""
REVIEW_SQL = """
INSERT INTO public.reviews
  (professor_id, course_id, user_id, body, overall_rating, workload_rating,
   grading_difficulty, tags, imported, is_anonymous, source_hash, created_at)
VALUES (%s, %s, NULL, %s, %s, %s, %s, %s, true, true, %s, %s)
ON CONFLICT (source_hash) WHERE source_hash IS NOT NULL DO NOTHING
RETURNING id
"""


@dataclass(frozen=True)
class ImportResult:
    inserted: int
    skipped: int


def import_reviews(connection: Any, reviews: Iterable[ImportedReview], batch_size: int = 100) -> ImportResult:
    if type(batch_size) is not int or not 1 <= batch_size <= 1000:
        raise ValidationError("batch_size must be between 1 and 1000")
    # Validate the complete input before the first write. A malformed later record
    # must not leave an earlier portion of a supposedly valid file published.
    records = validate_import_records(reviews)
    inserted = skipped = 0
    for start in range(0, len(records), batch_size):
        with connection.transaction():
            with connection.cursor() as cursor:
                for review in records[start:start + batch_size]:
                    cursor.execute(PROFESSOR_SQL, (review.professor_name, review.department))
                    professor_id = cursor.fetchone()[0]
                    cursor.execute(COURSE_SQL, (review.course_code, review.course_title, review.department))
                    course_id = cursor.fetchone()[0]
                    cursor.execute(REVIEW_SQL, (
                        professor_id, course_id, review.body, review.overall_rating,
                        review.workload_rating, review.grading_difficulty, list(review.tags),
                        review.source_hash, review.captured_at,
                    ))
                    if cursor.fetchone() is None:
                        skipped += 1
                    else:
                        inserted += 1
    return ImportResult(inserted, skipped)


def connect_database(url: str) -> Any:
    if not url:
        raise ValidationError("INGESTION_DATABASE_URL is required for import")
    import psycopg
    from psycopg.conninfo import conninfo_to_dict
    try:
        options = conninfo_to_dict(url)
    except Exception:
        raise ValidationError("INGESTION_DATABASE_URL is not a valid PostgreSQL connection string") from None
    if options.get("host", "") not in {"localhost", "127.0.0.1", "::1"}:
        if options.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
            options["sslmode"] = "require"
    options["connect_timeout"] = "15"
    return psycopg.connect(**options, autocommit=True)
