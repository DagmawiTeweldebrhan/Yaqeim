"""Emit the real importer's SQL and bound values for the PostgreSQL contract test.

Only synthetic data is used. The recorder provides placeholder entity IDs which
the JavaScript executor replaces with IDs returned by the actual database.
"""

import contextlib
import json

from yaqeim_ingest.import_db import import_reviews
from yaqeim_ingest.models import ImportedReview


class Recorder:
    def __init__(self):
        self.calls = []
        self.result = None

    @contextlib.contextmanager
    def transaction(self):
        yield

    @contextlib.contextmanager
    def cursor(self):
        yield self

    def execute(self, sql, parameters):
        self.calls.append({"sql": sql, "parameters": parameters})
        if "public.professors" in sql:
            self.result = ("00000000-0000-4000-8000-000000000001",)
        elif "public.courses" in sql:
            self.result = ("00000000-0000-4000-8000-000000000002",)
        else:
            self.result = ("00000000-0000-4000-8000-000000000003",)

    def fetchone(self):
        return self.result


base = {
    "professor_name": "O'Reilly; DROP TABLE users;--",
    "course_code": "TEST-UH 1001",
    "course_title": "Synthetic Import Contract",
    "department": "Test Department",
    "body": "Clear explanations and manageable assignments in this synthetic test review.",
    "overall_rating": 5,
    "workload_rating": None,
    "grading_difficulty": None,
    "tags": ["Easy A", "Light Workload"],
    "source_hash": "a" * 64,
    "captured_at": "2026-01-01T12:00:00+00:00",
}
result = []
for overrides in ({}, {"professor_name": base["professor_name"].lower(), "course_title": "Do not overwrite the catalog"}):
    recorder = Recorder()
    import_reviews(recorder, [ImportedReview.from_dict(base | overrides)])
    result.append(recorder.calls)
print(json.dumps(result))
