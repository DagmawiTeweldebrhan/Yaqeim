"""Explicit scrape → extract → editorial review → validate → import workflow."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict
from pathlib import Path

from .extract import GeminiExtractor
from .import_db import connect_database, import_reviews
from .models import ImportedReview, RawPost, ValidationError, read_jsonl, validate_import_records, write_jsonl
from .scrape import ScrapeOptions, scrape_posts


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description="NYUAD private feedback ingestion")
    commands = root.add_subparsers(dest="command", required=True)
    scrape = commands.add_parser("scrape", help="Collect authorized group post bodies locally")
    scrape.add_argument("--url", required=True)
    scrape.add_argument("--cookies", type=Path, required=True)
    scrape.add_argument("--output", type=Path, required=True)
    scrape.add_argument("--max-scrolls", type=int, default=100)
    scrape.add_argument("--max-posts", type=int, default=1000)
    scrape.add_argument("--message-selector", default=ScrapeOptions.__dataclass_fields__["message_selector"].default)
    extract = commands.add_parser("extract", help="Structure locally collected posts using Gemini")
    extract.add_argument("--input", type=Path, required=True)
    extract.add_argument("--output", type=Path, required=True)
    extract.add_argument("--model")
    validate = commands.add_parser("validate", help="Validate reviewed JSONL without a network request")
    validate.add_argument("--input", type=Path, required=True)
    ingest = commands.add_parser("import", help="Import manually reviewed records")
    ingest.add_argument("--input", type=Path, required=True)
    ingest.add_argument("--reviewed", action="store_true", help="Confirm identity, privacy, and factual review of every record")
    ingest.add_argument("--batch-size", type=int, default=100)
    ingest.add_argument("--dry-run", action="store_true", help="Validate and count records without connecting to a database")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "scrape":
            count = write_jsonl(args.output, scrape_posts(ScrapeOptions(
                args.url, args.cookies, max_scrolls=args.max_scrolls,
                max_posts=args.max_posts, message_selector=args.message_selector,
            )))
            print(json.dumps({"collected": count}))
        elif args.command == "extract":
            extractor = GeminiExtractor(model=args.model)
            count = write_jsonl(args.output, extractor.extract_all(read_jsonl(args.input, RawPost.from_dict)))
            print(json.dumps({"structured": count, "requires_editorial_review": True}))
        else:
            records = validate_import_records(read_jsonl(args.input, ImportedReview.from_dict))
            if args.command == "validate" or args.dry_run:
                print(json.dumps({"valid": len(records), "unique_sources": len({r.source_hash for r in records})}))
            else:
                if not args.reviewed:
                    raise ValidationError("Import requires --reviewed after checking every record for privacy and accuracy")
                with connect_database(os.environ.get("INGESTION_DATABASE_URL", "")) as connection:
                    result = import_reviews(connection, records, batch_size=args.batch_size)
                print(json.dumps(asdict(result)))
        return 0
    except (ValidationError, OSError) as exc:
        # OSError may contain sensitive paths; ValidationError messages are controlled.
        print(str(exc) if isinstance(exc, ValidationError) else "File operation failed; check paths and permissions", file=sys.stderr)
        return 1
    except Exception:
        # SDK/database exception messages can echo source content, cookies, or DSNs.
        print("Operation failed; check the service configuration and connectivity", file=sys.stderr)
        return 1
