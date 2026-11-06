"""E3-S3 acceptance tests (AC1-AC6, VM-048..VM-053): underwriting decision
with reason codes.

Self-contained: builds its own FastAPI app/`TestClient` directly against a
temp SQLite db, so this file is runnable from the repo root without the
`backend/tests` conftest, e.g.:

    cd backend && uv run pytest -q ../specs/test_artefacts/acceptance/test_e3_s3_underwriting.py
"""

from __future__ import annotations

import io
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from truelend.api.main import create_app
from truelend.config.db import DEMO_PASSWORD
from truelend.config.logging import configure_logging
from truelend.config.settings import Settings

_MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "backend" / "migrations"
_POLICIES_DIR = Path(__file__).resolve().parents[3] / "backend" / "policies"
_REQUIRED_DOCS = (("ID_PROOF", "id.png"), ("ADDRESS_PROOF", "addr.png"), ("SALARY_SLIP", "slip.png"))


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _make_settings(tmp_path: Path, *, policies_dir: Path | None = None) -> Settings:
    return Settings(
        jwt_secret="at-test-secret-not-for-production",
        db_path=tmp_path / "at.db",
        migrations_dir=_MIGRATIONS_DIR,
        policies_dir=policies_dir if policies_dir is not None else _POLICIES_DIR,
        env="test",
    )


def _login(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _body(**overrides: Any) -> dict[str, Any]:
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


def _submit(client: TestClient, headers: dict[str, str], **overrides: Any) -> int:
    r = client.post("/api/applications", json=_body(**overrides), headers=headers)
    assert r.status_code == 201, r.text
    app_id: int = r.json()["id"]
    for doc_type, filename in _REQUIRED_DOCS:
        up = client.post(
            f"/api/applications/{app_id}/documents",
            json={"type": doc_type, "filename": filename},
            headers=headers,
        )
        assert up.status_code == 201, up.text
    submit = client.post(f"/api/applications/{app_id}/submit", headers=headers)
    assert submit.status_code == 200, submit.text
    return app_id


def _approved_events(log_buffer: io.StringIO) -> list[dict[str, Any]]:
    lines = [json.loads(line) for line in log_buffer.getvalue().strip().splitlines() if line]
    return [line for line in lines if line["event"] == "ApplicationApproved"]


# tags: E3-S3-AC1
def test_e3_s3_ac1_auto_approve_publishes_one_event(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    log_buffer = io.StringIO()
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        configure_logging(stream=log_buffer)
        customer = _login(client, "customer1@example.test")
        app_id = _submit(client, customer, age_years=40, monthly_income="100000.00")
        r = client.post(f"/api/applications/{app_id}/underwrite", headers=customer)
    assert r.status_code == 200, r.text
    assert r.json() == {
        "decision": "AUTO_APPROVE",
        "score": 740,
        "reason_codes": ["SCORE_MEETS_AUTO_APPROVE"],
        "policy_version": 1,
        "status": "APPROVED",
    }
    events = _approved_events(log_buffer)
    assert len(events) == 1
    assert events[0]["application_id"] == app_id


# tags: E3-S3-AC2
def test_e3_s3_ac2_manual_review_band(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        customer = _login(client, "customer1@example.test")
        app_id = _submit(client, customer, age_years=30, monthly_income="60000.00")
        r = client.post(f"/api/applications/{app_id}/underwrite", headers=customer)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] == "MANUAL_REVIEW"
    assert body["reason_codes"] == ["SCORE_IN_REVIEW_BAND"]
    assert body["status"] == "MANUAL_REVIEW"


# tags: E3-S3-AC3
def test_e3_s3_ac3_auto_reject_low_score(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        customer = _login(client, "customer1@example.test")
        app_id = _submit(
            client,
            customer,
            age_years=30,
            monthly_income="30000.00",
            credit_flags={"prior_default": True, "missed_payment_12m": False, "thin_file": False},
        )
        r = client.post(f"/api/applications/{app_id}/underwrite", headers=customer)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] == "AUTO_REJECT"
    assert body["reason_codes"] == ["SCORE_BELOW_MIN"]
    assert body["status"] == "REJECTED"


# tags: E3-S3-AC4
def test_e3_s3_ac4_age_out_of_range_only_code(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        customer = _login(client, "customer1@example.test")
        app_id = _submit(client, customer, age_years=70, monthly_income="100000.00")
        r = client.post(f"/api/applications/{app_id}/underwrite", headers=customer)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] == "AUTO_REJECT"
    assert body["reason_codes"] == ["AGE_OUT_OF_RANGE"]
    assert body["status"] == "REJECTED"
    assert body["score"] == 700


def _tmp_policies_settings(tmp_path: Path) -> Settings:
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    (policies_dir / "policy_v0001.json").write_text(
        (_POLICIES_DIR / "policy_v0001.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    return _make_settings(tmp_path, policies_dir=policies_dir)


def _approve_v2_min_income(client: TestClient, min_income: str) -> None:
    editor = _login(client, "policy@example.test")
    draft = client.post(
        "/api/policies",
        json={"base_version": 1, "changes": {"PERSONAL": {"min_income": min_income}}},
        headers=editor,
    )
    assert draft.status_code == 201, draft.text
    admin = _login(client, "admin@example.test")
    approve = client.post(f"/api/policies/{draft.json()['version']}/approve", headers=admin)
    assert approve.status_code == 200, approve.text


# tags: E3-S3-AC5
def test_e3_s3_ac5_pinned_policy_version_used(tmp_path: Path) -> None:
    settings = _tmp_policies_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        customer = _login(client, "customer1@example.test")
        app_a = _submit(client, customer, age_years=30, monthly_income="26000.00")
        _approve_v2_min_income(client, "30000.00")
        customer2 = _login(client, "customer2@example.test")
        app_b = _submit(client, customer2, age_years=30, monthly_income="26000.00")
        result_a = client.post(f"/api/applications/{app_a}/underwrite", headers=customer)
        result_b = client.post(f"/api/applications/{app_b}/underwrite", headers=customer2)

    assert result_a.status_code == 200, result_a.text
    body_a = result_a.json()
    assert body_a["policy_version"] == 1
    assert body_a["decision"] == "MANUAL_REVIEW"
    assert body_a["score"] == 640

    assert result_b.status_code == 200, result_b.text
    body_b = result_b.json()
    assert body_b["policy_version"] == 2
    assert body_b["decision"] == "AUTO_REJECT"
    assert body_b["reason_codes"] == ["INCOME_BELOW_MIN"]


# tags: E3-S3-AC6
def test_e3_s3_ac6_not_submitted_and_already_decided(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    with TestClient(create_app(settings, clock=_FixedClock())) as client:
        customer = _login(client, "customer1@example.test")
        draft = client.post("/api/applications", json=_body(), headers=customer)
        assert draft.status_code == 201, draft.text
        draft_id = draft.json()["id"]
        not_submitted = client.post(f"/api/applications/{draft_id}/underwrite", headers=customer)
        assert not_submitted.status_code == 409
        assert not_submitted.json()["error"]["code"] == "NOT_SUBMITTED"

        app_id = _submit(client, customer, age_years=40, monthly_income="100000.00")
        first = client.post(f"/api/applications/{app_id}/underwrite", headers=customer)
        assert first.status_code == 200, first.text
        second = client.post(f"/api/applications/{app_id}/underwrite", headers=customer)
        assert second.status_code == 409
        assert second.json()["error"]["code"] == "ALREADY_DECIDED"

    conn = sqlite3.connect(settings.db_path)
    rows = conn.execute(
        "SELECT decision, score, policy_version FROM decisions WHERE application_id = ?",
        (app_id,),
    ).fetchall()
    conn.close()
    assert rows == [("AUTO_APPROVE", 740, 1)]
