"""E2-S3 acceptance tests (AC1-AC5, VM-030..VM-034): upload documents and
submit an application.

Self-contained: builds its own FastAPI app/`TestClient` directly against a
temp SQLite db, so this file is runnable from the repo root without the
`backend/tests` conftest, e.g.:

    cd backend && uv run pytest -q ../specs/test_artefacts/acceptance/test_e2_s3_documents.py
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


def _apply(client: TestClient, headers: dict[str, str]) -> dict[str, Any]:
    r = client.post("/api/applications", json=_personal_body(), headers=headers)
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    return body


def _upload(
    client: TestClient, headers: dict[str, str], application_id: int, doc_type: str, filename: str
) -> Any:
    return client.post(
        f"/api/applications/{application_id}/documents",
        json={"type": doc_type, "filename": filename},
        headers=headers,
    )


def _upload_all_but_salary_slip(
    client: TestClient, headers: dict[str, str], application_id: int
) -> None:
    _upload(client, headers, application_id, "ID_PROOF", "id_front.png")
    _upload(client, headers, application_id, "ADDRESS_PROOF", "address.png")


# tags: E2-S3-AC1
def test_e2_s3_ac1_owner_can_upload_document_with_no_file_content(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        _apply(client, headers)
        r = _upload(client, headers, 1, "ID_PROOF", "id_front.png")
    assert r.status_code == 201, r.text
    body = r.json()
    doc = next(d for d in body["required_documents"] if d["type"] == "ID_PROOF")
    assert doc["status"] == "UPLOADED"
    assert doc["filename"] == "id_front.png"
    assert "file" not in body
    assert "content" not in body


# tags: E2-S3-AC2
def test_e2_s3_ac2_document_type_not_on_checklist_is_422(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        _apply(client, headers)
        r = _upload(client, headers, 1, "VEHICLE_QUOTATION", "quote.png")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "DOCUMENT_TYPE_NOT_REQUIRED"


# tags: E2-S3-AC3
def test_e2_s3_ac3_missing_document_blocks_submit(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        _apply(client, headers)
        _upload_all_but_salary_slip(client, headers, 1)
        r = client.post("/api/applications/1/submit", headers=headers)
        status_after = client.get("/api/applications/1", headers=headers).json()["status"]
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "MISSING_DOCUMENTS"
    assert r.json()["error"]["missing"] == ["SALARY_SLIP"]
    assert status_after == "DRAFT"


# tags: E2-S3-AC4
def test_e2_s3_ac4_submit_succeeds_once_all_documents_uploaded(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        _apply(client, headers)
        _upload_all_but_salary_slip(client, headers, 1)
        _upload(client, headers, 1, "SALARY_SLIP", "slip.png")
        r = client.post("/api/applications/1/submit", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "SUBMITTED"
    assert body["policy_version"] == 1
    assert body["submitted_at"] is not None


# tags: E2-S3-AC5
def test_e2_s3_ac5_second_submit_is_already_submitted(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        headers = _login(client, "customer1@example.test")
        _apply(client, headers)
        _upload_all_but_salary_slip(client, headers, 1)
        _upload(client, headers, 1, "SALARY_SLIP", "slip.png")
        first = client.post("/api/applications/1/submit", headers=headers)
        assert first.status_code == 200, first.text
        second = client.post("/api/applications/1/submit", headers=headers)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ALREADY_SUBMITTED"
