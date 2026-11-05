"""Incident regression: GET /api/products as every seeded role, against the
real app, real migrations and the real seed data (no mocks), run the way the
dev server runs (`env` unset, wall clock).

Covers seed policy v1 and a policy v2 created and approved through the real
policy routes. Uses its own temp policies_dir: POST /api/policies writes a
new file, which must never land in the real `backend/policies/`.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings

_BACKEND = Path(__file__).resolve().parents[2]
_ROLE_EMAILS = (
    "admin@example.test",
    "policy@example.test",
    "underwriter@example.test",
    "customer1@example.test",
    "customer2@example.test",
)


@pytest.fixture
def dev_like_client(tmp_path: Path) -> Iterator[TestClient]:
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    seed = (_BACKEND / "policies" / "policy_v0001.json").read_text(encoding="utf-8")
    (policies_dir / "policy_v0001.json").write_text(seed, encoding="utf-8")
    settings = Settings(
        db_path=tmp_path / "dev.db",
        migrations_dir=_BACKEND / "migrations",
        policies_dir=policies_dir,
    )
    with TestClient(create_app(settings), raise_server_exceptions=False) as c:
        yield c


def _login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.mark.parametrize("email", _ROLE_EMAILS)
def test_products_ok_for_every_role_on_seed_policy(
    dev_like_client: TestClient, email: str
) -> None:
    r = dev_like_client.get("/api/products", headers=_login(dev_like_client, email))
    assert r.status_code == 200, r.text
    assert {p["product_type"] for p in r.json()} == {"PERSONAL", "VEHICLE", "EDUCATION"}


@pytest.mark.parametrize("email", _ROLE_EMAILS)
def test_products_ok_for_every_role_after_policy_v2_approved(
    dev_like_client: TestClient, email: str
) -> None:
    admin = _login(dev_like_client, "admin@example.test")
    created = dev_like_client.post(
        "/api/policies",
        headers=admin,
        json={"base_version": 1, "changes": {"PERSONAL": {"annual_rate_pct": "13.50"}}},
    )
    assert created.status_code == 201, created.text
    version = created.json()["version"]
    approved = dev_like_client.post(f"/api/policies/{version}/approve", headers=admin)
    assert approved.status_code == 200, approved.text

    r = dev_like_client.get("/api/products", headers=_login(dev_like_client, email))
    assert r.status_code == 200, r.text
    body = {p["product_type"]: p for p in r.json()}
    assert body["PERSONAL"]["annual_rate_pct"] == "13.50"
    assert body["PERSONAL"]["policy_version"] == version
