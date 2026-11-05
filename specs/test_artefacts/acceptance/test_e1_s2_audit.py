"""E1-S2 acceptance tests (AC1-AC4, VM-006..VM-009): the audit trail.

Self-contained: builds its own FastAPI app/`TestClient` directly against a
temp SQLite db, so this file is runnable from the repo root without the
`backend/tests` conftest, e.g.:

    cd backend && uv run pytest -q ../specs/test_artefacts/acceptance/test_e1_s2_audit.py
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings

_MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "backend" / "migrations"


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _make_client(tmp_path: Path) -> tuple[TestClient, Settings]:
    settings = Settings(
        jwt_secret="at-test-secret-not-for-production",
        db_path=tmp_path / "at.db",
        migrations_dir=_MIGRATIONS_DIR,
        env="test",
    )
    app = create_app(settings, clock=_FixedClock())
    return TestClient(app, raise_server_exceptions=False), settings


def _login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _audited_action(
    client: TestClient,
    headers: dict[str, str],
    entity_id: int,
    action: str = "REVIEW_APPROVED",
    fail: bool = False,
) -> Response:
    return cast(
        Response,
        client.post(
            "/api/_test/audited-action",
            headers=headers,
            json={
                "entity_type": "application",
                "entity_id": entity_id,
                "action": action,
                "fail": fail,
            },
        ),
    )


def test_e1_s2_ac1_successful_audited_action_writes_one_row(tmp_path: Path) -> None:
    client, _settings = _make_client(tmp_path)
    with client:
        underwriter = _login(client, "underwriter@example.test")
        admin = _login(client, "admin@example.test")

        r = _audited_action(client, underwriter, entity_id=7)
        assert r.status_code == 200
        correlation_id = r.headers["X-Correlation-ID"]

        body = client.get(
            "/api/audit",
            headers=admin,
            params={"entity_type": "application", "entity_id": 7},
        ).json()
        assert len(body["items"]) == 1
        entry = body["items"][0]
        assert entry["actor_user_id"] == 3
        assert entry["actor_role"] == "UNDERWRITER"
        assert entry["entity_type"] == "application"
        assert entry["entity_id"] == 7
        assert entry["correlation_id"] == correlation_id
        datetime.fromisoformat(entry["occurred_at"])  # UTC, parseable date-time


def test_e1_s2_ac2_update_or_delete_on_audit_log_aborts_and_row_unchanged(
    tmp_path: Path,
) -> None:
    client, settings = _make_client(tmp_path)
    with client:
        underwriter = _login(client, "underwriter@example.test")
        _audited_action(client, underwriter, entity_id=7)

        raw = sqlite3.connect(settings.db_path)
        before = raw.execute("SELECT action FROM audit_log").fetchone()
        with pytest.raises(sqlite3.DatabaseError):
            raw.execute("UPDATE audit_log SET action = 'TAMPERED'")
        with pytest.raises(sqlite3.DatabaseError):
            raw.execute("DELETE FROM audit_log")
        after = raw.execute("SELECT action FROM audit_log").fetchone()
        assert before == after == ("REVIEW_APPROVED",)
        raw.close()


def test_e1_s2_ac3_filtered_list_returns_exactly_3_rows_ascending(tmp_path: Path) -> None:
    client, _settings = _make_client(tmp_path)
    with client:
        underwriter = _login(client, "underwriter@example.test")
        admin = _login(client, "admin@example.test")

        for _ in range(3):
            _audited_action(client, underwriter, entity_id=7)
        for _ in range(2):
            _audited_action(client, underwriter, entity_id=8)

        body = client.get(
            "/api/audit",
            headers=admin,
            params={"entity_type": "application", "entity_id": 7},
        ).json()
        assert body["total"] == 3
        ids = [item["id"] for item in body["items"]]
        assert len(ids) == 3
        assert ids == sorted(ids)


def test_e1_s2_ac4_failed_audited_action_leaves_no_audit_row(tmp_path: Path) -> None:
    client, _settings = _make_client(tmp_path)
    with client:
        underwriter = _login(client, "underwriter@example.test")
        admin = _login(client, "admin@example.test")

        r = _audited_action(client, underwriter, entity_id=99, fail=True)
        assert r.status_code == 409
        assert r.json()["error"]["code"]

        body = client.get(
            "/api/audit",
            headers=admin,
            params={"entity_type": "application", "entity_id": 99},
        ).json()
        assert body["items"] == []
        assert body["total"] == 0
