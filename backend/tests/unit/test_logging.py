"""E1-S3 unit layer: redaction, correlation-id resolution, JSON format."""

from __future__ import annotations

import io
import json
import logging
import uuid

from truelend.config.logging import (
    configure_logging,
    redact,
    resolve_correlation_id,
)


def test_e1_s3_ac3_redacts_pan_and_aadhaar_forms() -> None:
    text = "pan ABCDE1234F aadhaar 123456789012 and 1234 5678 9012 end"
    out = redact(text)
    assert "ABCDE1234F" not in out
    assert "123456789012" not in out
    assert "1234 5678 9012" not in out


def test_e1_s3_ac4_redacts_document_filenames() -> None:
    out = redact("uploaded document 7 name salary_slip_jan.pdf ok")
    assert "salary_slip_jan.pdf" not in out
    assert "document 7" in out


def test_e1_s3_ac2_correlation_id_resolution() -> None:
    assert resolve_correlation_id("req-12345678") == "req-12345678"
    for bad in (None, "", "a b!", "short", "x" * 65):
        value = resolve_correlation_id(bad)
        assert str(uuid.UUID(value, version=4)) == value


def test_e1_s3_ac1_json_line_keys_and_redaction_filter() -> None:
    buf = io.StringIO()
    configure_logging(stream=buf)
    logging.getLogger("truelend.test").info(
        "PAN ABCDE1234F", extra={"fields": {"method": "GET", "note": "1234 5678 9012"}}
    )
    line = json.loads(buf.getvalue().strip())
    for key in ("ts", "level", "event", "correlation_id", "method"):
        assert key in line
    assert "ABCDE1234F" not in buf.getvalue()
    assert "1234 5678 9012" not in buf.getvalue()


def test_e1_s3_ac5_traceback_is_redacted() -> None:
    buf = io.StringIO()
    configure_logging(stream=buf)
    try:
        raise RuntimeError("bad pan ABCDE1234F")
    except RuntimeError:
        logging.getLogger("truelend.test").exception("failed")
    assert "ABCDE1234F" not in buf.getvalue()
    assert "RuntimeError" in buf.getvalue()
