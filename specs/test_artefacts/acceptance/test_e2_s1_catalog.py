"""E2-S1 acceptance tests (AC1-AC5, VM-020..VM-024): the product catalog
built from the active policy version.

Self-contained: builds its own FastAPI app/`TestClient` directly against a
temp SQLite db, so this file is runnable from the repo root without the
`backend/tests` conftest, e.g.:

    cd backend && uv run pytest -q ../specs/test_artefacts/acceptance/test_e2_s1_catalog.py
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings
from truelend.types.errors import PolicyChecksumMismatchError

_MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "backend" / "migrations"
_POLICIES_DIR = Path(__file__).resolve().parents[3] / "backend" / "policies"


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _make_settings(tmp_path: Path, policies_dir: Path | None = None) -> Settings:
    return Settings(
        jwt_secret="at-test-secret-not-for-production",
        db_path=tmp_path / "at.db",
        migrations_dir=_MIGRATIONS_DIR,
        policies_dir=policies_dir or _POLICIES_DIR,
        env="test",
    )


def _login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# tags: E2-S1-AC1
def test_e2_s1_ac1_exactly_3_products_at_policy_version_1(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        body = client.get("/api/products", headers=headers).json()
    assert len(body) == 3
    assert {p["product_type"] for p in body} == {"PERSONAL", "VEHICLE", "EDUCATION"}
    assert all(p["policy_version"] == 1 for p in body)


# tags: E2-S1-AC2
def test_e2_s1_ac2_thresholds_differ_by_product(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "underwriter@example.test")
        body = client.get("/api/products", headers=headers).json()
    by_type = {p["product_type"]: p for p in body}
    assert by_type["PERSONAL"]["min_income"] == "25000.00"
    assert by_type["VEHICLE"]["min_income"] == "30000.00"
    assert by_type["EDUCATION"]["min_income"] == "20000.00"


# tags: E2-S1-AC3
def test_e2_s1_ac3_required_documents_counts_by_product(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "policy@example.test")
        body = client.get("/api/products", headers=headers).json()
    by_type = {p["product_type"]: p for p in body}
    assert len(by_type["PERSONAL"]["required_documents"]) == 3
    assert len(by_type["VEHICLE"]["required_documents"]) == 4
    assert len(by_type["EDUCATION"]["required_documents"]) == 4


# tags: E2-S1-AC4
def test_e2_s1_ac4_missing_token_is_401(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        r = client.get("/api/products")
    assert r.status_code == 401


# tags: E2-S1-AC5
def test_e2_s1_ac5_tampered_policy_file_aborts_startup_with_checksum_mismatch(
    tmp_path: Path,
) -> None:
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    target = policies_dir / "policy_v0001.json"
    target.write_text(
        (_POLICIES_DIR / "policy_v0001.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    settings = _make_settings(tmp_path, policies_dir=policies_dir)

    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        assert client.get("/health").status_code == 200

    target.write_text(
        '{"version": 1, "products": {}, "reason_codes": {}, "override_reason_codes": []}',
        encoding="utf-8",
    )
    with pytest.raises(PolicyChecksumMismatchError) as exc:
        with TestClient(create_app(settings, clock=_FixedClock())):
            pass
    assert exc.value.code == "POLICY_CHECKSUM_MISMATCH"
