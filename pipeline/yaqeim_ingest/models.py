"""Strict, dependency-free validation at every ingestion trust boundary."""

from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

TAGS = (
    "Heavy Workload", "Light Workload", "Reading Heavy", "Easy A", "Harsh Grader",
    "Generous Curve", "Lecture Heavy", "Discussion Based", "Accessible Office Hours",
    "Self-Taught",
)


class ValidationError(ValueError):
    """An input cannot safely enter the archive. Messages never include input text."""


def normalized_text(value: Any, field: str, minimum: int = 1, maximum: int = 200) -> str:
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be text")
    value = unicodedata.normalize("NFKC", value).strip()
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value)
    if not minimum <= len(value) <= maximum:
        raise ValidationError(f"{field} has an invalid length")
    return value


def redact_contacts(text: str) -> str:
    """Remove obvious contact details; editorial review still handles names/context."""
    text = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email removed]", text, flags=re.I)
    text = re.sub(r"https?://\S+|www\.\S+", "[link removed]", text, flags=re.I)
    text = re.sub(r"(?<!\w)@\w+", "[mention removed]", text)
    text = re.sub(r"(?<!\w)\+\d[\d ()-]{7,}\d", "[phone removed]", text)
    return text


def rating(value: Any, field: str, nullable: bool = False) -> int | None:
    if value is None and nullable:
        return None
    if type(value) is not int or not 1 <= value <= 5:
        raise ValidationError(f"{field} must be an integer from 1 to 5")
    return value


def sentiment_to_rating(value: Any) -> int:
    """Map the source 1–10 scale to 1–5 bins: 1/2→1, 3/4→2, …, 9/10→5."""
    if type(value) is not int or not 1 <= value <= 10:
        raise ValidationError("sentiment_score must be an integer from 1 to 10")
    return math.ceil(value / 2)


def timestamp(value: Any) -> str:
    if not isinstance(value, str):
        raise ValidationError("captured_at must be an ISO 8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError("captured_at must be an ISO 8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise ValidationError("captured_at must contain a timezone")
    return parsed.astimezone(timezone.utc).isoformat()


@dataclass(frozen=True)
class RawPost:
    source_id: str
    body: str
    captured_at: str

    @classmethod
    def from_dict(cls, value: Any) -> "RawPost":
        if not isinstance(value, dict) or set(value) != {"source_id", "body", "captured_at"}:
            raise ValidationError("Raw post fields must be source_id, body, captured_at")
        return cls(
            normalized_text(value["source_id"], "source_id", maximum=300),
            normalized_text(value["body"], "body", minimum=10, maximum=30000),
            timestamp(value["captured_at"]),
        )


@dataclass(frozen=True)
class ImportedReview:
    professor_name: str
    course_code: str
    course_title: str
    department: str
    body: str
    overall_rating: int
    workload_rating: int | None
    grading_difficulty: int | None
    tags: tuple[str, ...]
    source_hash: str
    captured_at: str

    @classmethod
    def from_dict(cls, value: Any) -> "ImportedReview":
        if not isinstance(value, dict) or set(value) != set(cls.__dataclass_fields__):
            raise ValidationError("Structured review contains missing or unexpected fields")
        name = " ".join(normalized_text(value["professor_name"], "professor_name", maximum=160).split())
        code = " ".join(normalized_text(value["course_code"], "course_code", maximum=40).upper().split())
        title = normalized_text(value["course_title"], "course_title", maximum=200)
        department = normalized_text(value["department"], "department", maximum=120)
        body = normalized_text(value["body"], "body", minimum=20, maximum=5000)
        tags = value["tags"]
        if not isinstance(tags, (list, tuple)) or any(not isinstance(tag, str) or tag not in TAGS for tag in tags):
            raise ValidationError("tags must contain only standardized taxonomy entries")
        if len(set(tags)) != len(tags):
            raise ValidationError("tags must not contain duplicates")
        source_hash = value["source_hash"]
        if not isinstance(source_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", source_hash):
            raise ValidationError("source_hash must be a SHA256 digest")
        if redact_contacts(body) != body:
            raise ValidationError("body contains unredacted contact details")
        return cls(name, code, title, department, body,
                   rating(value["overall_rating"], "overall_rating"),
                   rating(value["workload_rating"], "workload_rating", nullable=True),
                   rating(value["grading_difficulty"], "grading_difficulty", nullable=True),
                   tuple(tags), source_hash, timestamp(value["captured_at"]))


def source_hash(source_id: str, professor_name: str, course_code: str) -> str:
    canonical = [" ".join(unicodedata.normalize("NFKC", item).casefold().split())
                 for item in (source_id, professor_name, course_code)]
    return hashlib.sha256(json.dumps(canonical, ensure_ascii=False).encode("utf-8")).hexdigest()


def read_jsonl(path: Path, validator: Any) -> Iterable[Any]:
    with path.open("r", encoding="utf-8-sig") as stream:
        for number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            if len(line) > 100000:
                raise ValidationError(f"Input line {number} exceeds the size limit")
            try:
                yield validator(json.loads(line))
            except (json.JSONDecodeError, ValidationError) as exc:
                raise ValidationError(f"Invalid record at line {number}: {type(exc).__name__}") from exc


def validate_import_records(reviews: Iterable[ImportedReview]) -> list[ImportedReview]:
    records = [ImportedReview.from_dict(asdict(review)) for review in reviews]
    seen: dict[str, ImportedReview] = {}
    for review in records:
        prior = seen.get(review.source_hash)
        if prior is not None and prior != review:
            raise ValidationError("Conflicting records share a source_hash")
        seen[review.source_hash] = review
    return records


def write_jsonl(path: Path, records: Iterable[Any]) -> int:
    """Create a new private output without silently overwriting an earlier run."""
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("x", encoding="utf-8") as stream:
        try:
            path.chmod(0o600)
        except OSError:
            pass  # On Windows, use the user's directory ACL; see the runbook.
        for record in records:
            stream.write(json.dumps(asdict(record), ensure_ascii=False) + "\n")
            stream.flush()
            count += 1
    return count
