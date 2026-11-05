"""Incident regression: an unhandled 500 must be traceable from its
correlation_id in the app's own log, without the test (or the operator)
calling `configure_logging` by hand.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings

_MIGRATIONS = Path(__file__).resolve().parents[2] / "migrations"


@pytest.fixture(autouse=True)
def _clean_truelend_logger() -> Iterator[None]:
    logger = logging.getLogger("truelend")
    saved = (list(logger.handlers), logger.level, logger.propagate)
    logger.handlers.clear()
    yield
    logger.handlers[:] = saved[0]
    logger.setLevel(saved[1])
    logger.propagate = saved[2]


def test_unhandled_500_is_logged_at_error_with_correlation_id_and_trace(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    settings = Settings(db_path=tmp_path / "t.db", migrations_dir=_MIGRATIONS, env="test")
    with TestClient(create_app(settings), raise_server_exceptions=False) as c:
        token = c.post(
            "/api/auth/login", json={"email": "admin@example.test", "password": DEMO_PASSWORD}
        ).json()["access_token"]
        r = c.get("/api/_test/boom", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 500
    correlation_id = r.json()["error"]["correlation_id"]

    entries = [json.loads(x) for x in capsys.readouterr().err.splitlines() if x.startswith("{")]
    failed = [e for e in entries if e.get("path") == "/api/_test/boom"]
    assert len(failed) == 1
    assert failed[0]["level"] == "ERROR"
    assert failed[0]["correlation_id"] == correlation_id
    assert "RuntimeError" in failed[0]["trace"]
