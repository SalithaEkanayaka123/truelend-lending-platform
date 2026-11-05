"""E4-S1 acceptance tests (AC1-AC6, VM-065..VM-070): create and approve policy
versions.

Self-contained: builds its own FastAPI app/`TestClient` against a temp SQLite
db and a temp copy of the policies directory (POST /api/policies writes a new
file, so this must never point at the real `backend/policies/`), so this file
is runnable from the repo root without the `backend/tests` conftest, e.g.:

    cd backend && uv run pytest -q ../specs/test_artefacts/acceptance/test_e4_s1_policies.py
"""

from __future__ import annotations

import hashlib
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings

_MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "backend" / "migrations"
_SEED_POLICY_FILE = (
    Path(__file__).resolve().parents[3] / "backend" / "policies" / "policy_v0001.json"
)


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _make_settings(tmp_path: Path) -> Settings:
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    (policies_dir / "policy_v0001.json").write_text(
        _SEED_POLICY_FILE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    return Settings(
        jwt_secret="at-test-secret-not-for-production",
        db_path=tmp_path / "at.db",
        migrations_dir=_MIGRATIONS_DIR,
        policies_dir=policies_dir,
        env="test",
    )


def _login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create_draft(
    client: TestClient, headers: dict[str, str], **overrides: Any
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "base_version": 1,
        "changes": {"PERSONAL": {"min_income": "30000.00"}},
    }
    body.update(overrides)
    r = client.post("/api/policies", json=body, headers=headers)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


# tags: E4-S1-AC1
def test_e4_s1_ac1_policy_editor_creates_draft_version_two(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    original_sha = _sha256(settings.policies_dir / "policy_v0001.json")
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        editor_headers = _login(client, "policy@example.test")
        body = _create_draft(client, editor_headers)
        admin_headers = _login(client, "admin@example.test")
        audit = client.get(
            "/api/audit",
            headers=admin_headers,
            params={"entity_type": "policy_version", "entity_id": 2, "action": "POLICY_CREATED"},
        ).json()
    assert body["version"] == 2
    assert body["status"] == "DRAFT"
    assert (settings.policies_dir / "policy_v0002.json").is_file()
    assert audit["total"] == 1
    assert _sha256(settings.policies_dir / "policy_v0001.json") == original_sha


# tags: E4-S1-AC2
def test_e4_s1_ac2_draft_does_not_change_active_catalog(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "policy@example.test")
        _create_draft(client, headers)
        products = client.get("/api/products", headers=headers).json()
    by_type = {p["product_type"]: p for p in products}
    assert by_type["PERSONAL"]["min_income"] == "25000.00"
    assert by_type["PERSONAL"]["policy_version"] == 1


# tags: E4-S1-AC3
def test_e4_s1_ac3_admin_approves_draft_and_catalog_updates(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        editor_headers = _login(client, "policy@example.test")
        _create_draft(client, editor_headers)
        admin_headers = _login(client, "admin@example.test")
        r = client.post("/api/policies/2/approve", headers=admin_headers)
        audit = client.get(
            "/api/audit",
            headers=admin_headers,
            params={"entity_type": "policy_version", "entity_id": 2, "action": "POLICY_APPROVED"},
        ).json()
        products = client.get("/api/products", headers=admin_headers).json()
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPROVED"
    assert r.json()["approved_by"] == 1
    assert audit["total"] == 1
    by_type = {p["product_type"]: p for p in products}
    assert by_type["PERSONAL"]["min_income"] == "30000.00"
    assert by_type["PERSONAL"]["policy_version"] == 2


# tags: E4-S1-AC4
def test_e4_s1_ac4_no_mutation_verb_and_db_update_aborts(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "admin@example.test")
        put_r = client.put("/api/policies/1", headers=headers, json={})
        patch_r = client.patch("/api/policies/1", headers=headers, json={})
        delete_r = client.delete("/api/policies/1", headers=headers)
    assert put_r.status_code == 405
    assert patch_r.status_code == 405
    assert delete_r.status_code == 405

    conn = sqlite3.connect(settings.db_path)
    try:
        with pytest.raises(sqlite3.DatabaseError):
            conn.execute(
                "UPDATE policy_versions SET file_path = 'tampered.json' WHERE version = 1"
            )
    finally:
        conn.close()


# tags: E4-S1-AC5
def test_e4_s1_ac5_policy_editor_cannot_approve(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        editor_headers = _login(client, "policy@example.test")
        _create_draft(client, editor_headers)
        r = client.post("/api/policies/2/approve", headers=editor_headers)
    assert r.status_code == 403


# tags: E4-S1-AC6
def test_e4_s1_ac6_invalid_score_band_is_422_and_writes_no_file(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "policy@example.test")
        r = client.post(
            "/api/policies",
            json={
                "base_version": 1,
                "changes": {
                    "PERSONAL": {"auto_reject_below_score": 750, "auto_approve_min_score": 700}
                },
            },
            headers=headers,
        )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "auto_reject_below_score" in r.json()["error"]["message"]
    assert not (settings.policies_dir / "policy_v0002.json").exists()


# tags: E4-S1-AC6
def test_e4_s1_ac6_negative_min_income_is_422_and_writes_no_file(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "policy@example.test")
        r = client.post(
            "/api/policies",
            json={"base_version": 1, "changes": {"PERSONAL": {"min_income": "-1"}}},
            headers=headers,
        )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "min_income" in r.json()["error"]["message"]
    assert not (settings.policies_dir / "policy_v0002.json").exists()
