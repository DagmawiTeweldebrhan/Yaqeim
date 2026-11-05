"""Opt-in loading of explicitly named configuration without exposing credentials."""

from __future__ import annotations

import os
from pathlib import Path

from .models import ValidationError

PIPELINE_ENV_KEYS = frozenset({
    "FB_C_USER", "FB_XS", "ROR_GROUP_ID", "GEMINI_API_KEY", "GEMINI_MODEL",
    "INGESTION_DATABASE_URL",
})


def load_environment_file(path: Path) -> None:
    """Read only this file, preserve existing env values, and never expand secrets."""
    from dotenv import dotenv_values

    try:
        with path.open("r", encoding="utf-8-sig") as stream:
            values = dotenv_values(stream=stream, interpolate=False)
    except (OSError, UnicodeError):
        raise ValidationError("Cannot read the explicitly selected environment file") from None
    for key in PIPELINE_ENV_KEYS:
        value = values.get(key)
        if value is not None:
            os.environ.setdefault(key, value)
