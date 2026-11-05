"""E1-S3 API layer: one JSON line per request, correlation id, 500 envelope (VM-010..014)."""

from __future__ import annotations

import io
import json
import uuid
from collections.abc import Callable

from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.logging import configure_logging
from truelend.config.settings import Settings

from ..conftest import FakeClock

KEYS = {"ts", "level", "event", "correlation_id", "method", "path", "status", "duration_ms"}


def lines(buf: io.StringIO) -> list[dict[str, object]]:
    return [json.loads(x) for x in buf.getvalue().splitlines() if x.strip()]


def test_e1_s3_ac1_exactly_one_json_line_per_request(
    client: TestClient, log_buffer: io.StringIO
) -> None:
    client.get("/health")
    got = [x for x in lines(log_buffer) if x.get("path") == "/health"]
    assert len(got) == 1
    assert KEYS <= set(got[0])
    assert got[0]["status"] == 200
    assert len(lines(log_buffer)) == 1


def test_e1_s3_ac2_correlation_id_cases(client: TestClient, log_buffer: io.StringIO) -> None:
    r = client.get("/health")
    cid = r.headers["X-Correlation-ID"]
    assert str(uuid.UUID(cid, version=4)) == cid
    assert lines(log_buffer)[-1]["correlation_id"] == cid
    r = client.get("/health", headers={"X-Correlation-ID": "req-12345678"})
    assert r.headers["X-Correlation-ID"] == "req-12345678"
    assert lines(log_buffer)[-1]["correlation_id"] == "req-12345678"
    r = client.get("/health", headers={"X-Correlation-ID": "a b!"})
    assert r.headers["X-Correlation-ID"] != "a b!"
    assert uuid.UUID(r.headers["X-Correlation-ID"], version=4)


def test_e1_s3_ac3_no_pii_in_logs_on_success_and_error_paths(
    client: TestClient, log_buffer: io.StringIO, login: Callable[[str], dict[str, str]]
) -> None:
    pan, aadhaar = "ABCDE1234F", "1234 5678 9012"
    h = login("admin@example.test")
    client.get(f"/api/audit?entity_type={pan}&x={aadhaar}", headers=h)
    client.get(f"/missing/{pan}/{aadhaar.replace(' ', '')}")
    client.post("/api/auth/login", json={"email": pan, "password": aadhaar})
    out = log_buffer.getvalue()
    assert out.strip()
    for secret in (pan, "123456789012", aadhaar):
        assert secret not in out


def test_e1_s3_ac5_unhandled_exception_envelope_and_trace(
    client: TestClient, log_buffer: io.StringIO, login: Callable[[str], dict[str, str]]
) -> None:
    h = login("admin@example.test")
    r = client.get("/api/_test/boom", headers=h)
    assert r.status_code == 500
    body = r.json()["error"]
    assert body["code"] == "INTERNAL_ERROR"
    assert body["correlation_id"] == r.headers["X-Correlation-ID"]
    assert "Traceback" not in r.text and "RuntimeError" not in r.text
    entry = [x for x in lines(log_buffer) if x.get("path") == "/api/_test/boom"]
    assert len(entry) == 1 and entry[0]["status"] == 500
    assert "RuntimeError" in json.dumps(entry[0])


def test_e1_s3_boom_route_absent_outside_test_env(
    make_settings: Callable[[str | None], Settings], clock: FakeClock
) -> None:
    for env in (None, "production"):
        app = create_app(make_settings(env), clock=clock)
        configure_logging(stream=io.StringIO())
        paths = {getattr(x, "path", "") for x in app.routes}
        assert "/api/_test/boom" not in paths
        with TestClient(app, raise_server_exceptions=False) as c:
            r = c.get("/api/_test/boom")
            assert r.status_code == 404
            assert r.json()["error"]["code"] == "NOT_FOUND"
