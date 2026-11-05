"""E2-S2 acceptance tests (AC1-AC5, VM-025..VM-029): apply for a loan.

Self-contained: builds its own FastAPI app/`TestClient` directly against a
temp SQLite db, so this file is runnable from the repo root without the
`backend/tests` conftest, e.g.:

    cd backend && uv run pytest -q ../specs/test_artefacts/acceptance/test_e2_s2_apply.py
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.settings import Settings

_MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "backend" / "migrations"
_POLICIES_DIR = Path(__file__).resolve().parents[3] / "backend" / "policies"


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        jwt_secret="at-test-secret-not-for-production",
        db_path=tmp_path / "at.db",
        migrations_dir=_MIGRATIONS_DIR,
        policies_dir=_POLICIES_DIR,
        env="test",
    )


def _login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _personal_body(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "product_type": "PERSONAL",
        "requested_amount": "200000.00",
        "tenure_months": 24,
        "age_years": 30,
        "monthly_income": "60000.00",
        "credit_flags": {
            "prior_default": False,
            "missed_payment_12m": False,
            "thin_file": False,
        },
        "pan": "ABCDE1234F",
        "aadhaar": "123456789012",
    }
    body.update(overrides)
    return body


def _apply(client: TestClient, headers: dict[str, str], **overrides: Any) -> dict[str, Any]:
    r = client.post("/api/applications", json=_personal_body(**overrides), headers=headers)
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    return body


# tags: E2-S2-AC1
def test_e2_s2_ac1_customer_can_apply_for_personal_loan(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        body = _apply(client, headers)
    assert body["id"] == 1
    assert body["status"] == "DRAFT"
    assert body["applicant_user_id"] == 4


# tags: E2-S2-AC2
def test_e2_s2_ac2_checklist_matches_product_required_documents(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        personal = _apply(client, headers)
        vehicle = _apply(client, headers, product_type="VEHICLE", requested_amount="300000.00")
        education = _apply(
            client, headers, product_type="EDUCATION", requested_amount="300000.00"
        )
    personal_docs = {(d["type"], d["status"]) for d in personal["required_documents"]}
    assert personal_docs == {
        ("ID_PROOF", "MISSING"),
        ("ADDRESS_PROOF", "MISSING"),
        ("SALARY_SLIP", "MISSING"),
    }
    vehicle_types = {d["type"] for d in vehicle["required_documents"]}
    assert len(vehicle["required_documents"]) == 4
    assert "VEHICLE_QUOTATION" in vehicle_types
    education_types = {d["type"] for d in education["required_documents"]}
    assert {"ADMISSION_LETTER", "FEE_STRUCTURE"} <= education_types


# tags: E2-S2-AC3
def test_e2_s2_ac3_tenure_out_of_range_is_422(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        r = client.post(
            "/api/applications", json=_personal_body(tenure_months=72), headers=headers
        )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "TENURE_OUT_OF_RANGE"


# tags: E2-S2-AC3
def test_e2_s2_ac3_amount_out_of_range_is_422(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        r = client.post(
            "/api/applications",
            json=_personal_body(requested_amount="10000.00"),
            headers=headers,
        )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "AMOUNT_OUT_OF_RANGE"


# tags: E2-S2-AC4
def test_e2_s2_ac4_malformed_pan_or_aadhaar_is_validation_error(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        bad_pan = client.post(
            "/api/applications", json=_personal_body(pan="abc"), headers=headers
        )
        bad_aadhaar = client.post(
            "/api/applications", json=_personal_body(aadhaar="12345678901"), headers=headers
        )
    assert bad_pan.status_code == 422
    assert bad_pan.json()["error"]["code"] == "VALIDATION_ERROR"
    assert bad_aadhaar.status_code == 422
    assert bad_aadhaar.json()["error"]["code"] == "VALIDATION_ERROR"


# tags: E2-S2-AC4
def test_e2_s2_ac4_valid_application_masks_pan_and_aadhaar(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        r = client.post("/api/applications", json=_personal_body(), headers=headers)
    body = r.json()
    assert body["pan_masked"] == "******234F"
    assert body["aadhaar_masked"] == "********9012"
    assert "pan" not in body
    assert "aadhaar" not in body
    assert "ABCDE1234F" not in r.text
    assert "123456789012" not in r.text


# tags: E2-S2-AC5
def test_e2_s2_ac5_other_customer_gets_404(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        owner_headers = _login(client, "customer1@example.test")
        _apply(client, owner_headers)
        other_headers = _login(client, "customer2@example.test")
        r = client.get("/api/applications/1", headers=other_headers)
    assert r.status_code == 404
