"""JSON structured logging, correlation ids, and PII redaction (E1-S3).

Never log PAN, Aadhaar numbers, or document filenames (NFR-03, F0 FA-F0.6).
Request/response bodies are never logged by anything in this module.
"""

from __future__ import annotations

import json
import logging
import re
import traceback
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import IO, Any

_REDACTED = "[REDACTED]"

_DOCUMENT_FILENAME_RE = re.compile(
    r"\b[\w.-]+\.(?:pdf|docx?|xlsx?|jpe?g|png)\b", re.IGNORECASE
)
_AADHAAR_SPACED_RE = re.compile(r"\b\d{4}[ -]\d{4}[ -]\d{4}\b")
_AADHAAR_PLAIN_RE = re.compile(r"\b\d{12}\b")
_PAN_RE = re.compile(r"\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b")

_CORRELATION_ID_RE = re.compile(r"^[A-Za-z0-9-]{8,64}$")
_correlation_id_var: ContextVar[str | None] = ContextVar("truelend_correlation_id", default=None)


def redact(text: str) -> str:
    """Strip PAN numbers, Aadhaar numbers, and document filenames from free text."""
    out = _DOCUMENT_FILENAME_RE.sub(_REDACTED, text)
    out = _AADHAAR_SPACED_RE.sub(_REDACTED, out)
    out = _AADHAAR_PLAIN_RE.sub(_REDACTED, out)
    out = _PAN_RE.sub(_REDACTED, out)
    return out


def resolve_correlation_id(candidate: str | None) -> str:
    """Return `candidate` if it matches `^[A-Za-z0-9-]{8,64}$`, else a fresh UUID4."""
    if candidate and _CORRELATION_ID_RE.match(candidate):
        return candidate
    return str(uuid.uuid4())


def set_correlation_id(value: str) -> None:
    """Bind the current request's correlation id for this task's log records."""
    _correlation_id_var.set(value)


def get_correlation_id() -> str | None:
    return _correlation_id_var.get()


class RedactionFilter(logging.Filter):
    """Redacts PII from the message and any `extra={"fields": ...}` values
    before formatting, so no handler can ever see a raw PAN/Aadhaar/filename."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = ()
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            record.fields = {
                key: redact(value) if isinstance(value, str) else value
                for key, value in fields.items()
            }
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per log line: ts, level, event, correlation_id, plus any
    caller-supplied `fields`. Tracebacks are redacted before being embedded."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "event": record.getMessage(),
            "correlation_id": get_correlation_id() or "-",
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            payload.update(fields)
        if record.exc_info:
            trace = "".join(traceback.format_exception(*record.exc_info))
            payload["trace"] = redact(trace)
        return json.dumps(payload)


def configure_logging(stream: IO[str] | None = None, level: int = logging.INFO) -> None:
    """(Re)configure the `truelend` logger to emit one redacted JSON line per
    record to `stream` (defaults to stderr). Safe to call more than once."""
    logger = logging.getLogger("truelend")
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactionFilter())
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
