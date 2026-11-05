"""API tests for POST /api/policies, POST /api/policies/{version}/approve, and
GET /api/policies/{version} (E4-S1, VM-065..VM-070).

Self-contained: its own temp policies_dir (never the real `backend/policies/`,
since POST /api/policies writes a new file there) and its own `TestClient` --
does not use the shared `client`/`login` conftest fixtures, which default
`Settings.policies_dir` to the real directory.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_REAL_POLICY_FILE = Path(__file__).resolve().parents[2] / "policies" / "policy_v0001.json"


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _settings(tmp_path: Path) -> Settings:
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    (policies_dir / "policy_v0001.json").write_text(
        _REAL_POLICY_FILE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    return Settings(
        jwt_secret="api-test-secret-not-for-production",
        db_path=tmp_path / "api.db",
        migrations_dir=_MIGRATIONS_DIR,
        policies_dir=policies_dir,
        env="test",
    )


def _login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _create_draft(client: TestClient, headers: dict[str, str], **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "base_version": 1,
        "changes": {"PERSONAL": {"min_income": "30000.00"}},
    }
    body.update(overrides)
    r = client.post("/api/policies", json=body, headers=headers)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def test_create_policy_returns_draft_version_two(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "policy@example.test")
        body = _create_draft(client, headers)
    assert body["version"] == 2
    assert body["status"] == "DRAFT"
    assert body["created_by"] == 2


def test_approve_requires_admin_role(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        editor_headers = _login(client, "policy@example.test")
        _create_draft(client, editor_headers)
        r = client.post("/api/policies/2/approve", headers=editor_headers)
    assert r.status_code == 403


def test_approve_unknown_version_is_404(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "admin@example.test")
        r = client.post("/api/policies/99/approve", headers=headers)
    assert r.status_code == 404


def test_approve_already_approved_is_409(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "admin@example.test")
        r = client.post("/api/policies/1/approve", headers=headers)
    assert r.status_code == 409


def test_get_policy_version_returns_approved_version_one(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "policy@example.test")
        r = client.get("/api/policies/1", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 1
    assert r.json()["status"] == "APPROVED"


def test_get_policy_version_unknown_is_404(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "policy@example.test")
        r = client.get("/api/policies/99", headers=headers)
    assert r.status_code == 404


def test_create_policy_invalid_score_band_is_422_no_file(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
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
    assert "auto_reject_below_score" in r.json()["error"]["message"]
    assert not (settings.policies_dir / "policy_v0002.json").exists()


def test_mutation_verbs_on_policies_path_are_405(tmp_path: Path) -> None:
    settings = _settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "admin@example.test")
        assert client.put("/api/policies/1", headers=headers, json={}).status_code == 405
        assert client.patch("/api/policies/1", headers=headers, json={}).status_code == 405
        assert client.delete("/api/policies/1", headers=headers).status_code == 405
