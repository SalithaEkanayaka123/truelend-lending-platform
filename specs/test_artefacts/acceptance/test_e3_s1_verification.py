"""E3-S1 acceptance tests (AC1-AC5, VM-038..VM-042): verification queue and
document verify/reject.

Self-contained: builds its own FastAPI app/`TestClient` directly against a
temp SQLite db, so this file is runnable from the repo root without the
`backend/tests` conftest, e.g.:

    cd backend && uv run pytest -q ../specs/test_artefacts/acceptance/test_e3_s1_verification.py
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
_REQUIRED_DOCS = (("ID_PROOF", "id.png"), ("ADDRESS_PROOF", "addr.png"), ("SALARY_SLIP", "slip.png"))


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
        "credit_flags": {"prior_default": False, "missed_payment_12m": False, "thin_file": False},
        "pan": "ABCDE1234F",
        "aadhaar": "123456789012",
    }
    body.update(overrides)
    return body


def _submitted_application(client: TestClient, headers: dict[str, str]) -> None:
    r = client.post("/api/applications", json=_personal_body(), headers=headers)
    assert r.status_code == 201, r.text
    for doc_type, filename in _REQUIRED_DOCS:
        up = client.post(
            "/api/applications/1/documents",
            json={"type": doc_type, "filename": filename},
            headers=headers,
        )
        assert up.status_code == 201, up.text
    submit = client.post("/api/applications/1/submit", headers=headers)
    assert submit.status_code == 200, submit.text


# tags: E3-S1-AC1
def test_e3_s1_ac1_queue_lists_three_uploaded_documents_oldest_first(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        _submitted_application(client, _login(client, "customer1@example.test"))
        r = client.get(
            "/api/verification-queue", headers=_login(client, "underwriter@example.test")
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert [item["type"] for item in body["items"]] == ["ID_PROOF", "ADDRESS_PROOF", "SALARY_SLIP"]
    assert all(item["application_id"] == 1 for item in body["items"])


# tags: E3-S1-AC2
def test_e3_s1_ac2_verify_sets_verified_writes_audit_and_leaves_queue(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        _submitted_application(client, _login(client, "customer1@example.test"))
        underwriter = _login(client, "underwriter@example.test")
        r = client.post(
            "/api/documents/1/verify",
            json={"outcome": "VERIFIED", "reason": "Name matches PAN record"},
            headers=underwriter,
        )
        admin = _login(client, "admin@example.test")
        audit = client.get(
            "/api/audit", headers=admin, params={"entity_type": "document", "entity_id": 1}
        ).json()
        queue = client.get("/api/verification-queue", headers=underwriter).json()
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "VERIFIED"
    assert body["verified_by"] == 3
    assert audit["items"][-1]["action"] == "DOCUMENT_VERIFIED"
    assert all(item["document_id"] != 1 for item in queue["items"])


# tags: E3-S1-AC3
def test_e3_s1_ac3_reject_keeps_application_submitted(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        _submitted_application(client, _login(client, "customer1@example.test"))
        underwriter = _login(client, "underwriter@example.test")
        r = client.post(
            "/api/documents/2/verify",
            json={"outcome": "REJECTED", "reason": "Image unreadable"},
            headers=underwriter,
        )
        admin = _login(client, "admin@example.test")
        audit = client.get(
            "/api/audit", headers=admin, params={"entity_type": "document", "entity_id": 2}
        ).json()
        app_status = client.get("/api/applications/1", headers=underwriter).json()["status"]
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "REJECTED"
    assert body["reason"] == "Image unreadable"
    assert audit["items"][-1]["action"] == "DOCUMENT_REJECTED"
    assert app_status == "SUBMITTED"


# tags: E3-S1-AC4
def test_e3_s1_ac4_bad_reason_is_422_with_no_audit_row(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        _submitted_application(client, _login(client, "customer1@example.test"))
        underwriter = _login(client, "underwriter@example.test")
        admin = _login(client, "admin@example.test")
        statuses = []
        for reason in (None, "", "x" * 501):
            payload: dict[str, Any] = {"outcome": "VERIFIED"}
            if reason is not None:
                payload["reason"] = reason
            r = client.post("/api/documents/3/verify", json=payload, headers=underwriter)
            statuses.append((r.status_code, r.json()["error"]["code"]))
        audit = client.get(
            "/api/audit", headers=admin, params={"entity_type": "document", "entity_id": 3}
        ).json()
    assert statuses == [(422, "VALIDATION_ERROR")] * 3
    assert audit["items"] == []


# tags: E3-S1-AC5
def test_e3_s1_ac5_customer_forbidden_and_reverify_is_already_verified(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        customer = _login(client, "customer1@example.test")
        _submitted_application(client, customer)
        underwriter = _login(client, "underwriter@example.test")
        queue_forbidden = client.get("/api/verification-queue", headers=customer)
        verify_forbidden = client.post(
            "/api/documents/1/verify",
            json={"outcome": "VERIFIED", "reason": "ok"},
            headers=customer,
        )
        first = client.post(
            "/api/documents/1/verify",
            json={"outcome": "VERIFIED", "reason": "Name matches PAN record"},
            headers=underwriter,
        )
        second = client.post(
            "/api/documents/1/verify",
            json={"outcome": "VERIFIED", "reason": "Name matches PAN record"},
            headers=underwriter,
        )
    assert queue_forbidden.status_code == 403
    assert verify_forbidden.status_code == 403
    assert first.status_code == 200, first.text
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ALREADY_VERIFIED"
