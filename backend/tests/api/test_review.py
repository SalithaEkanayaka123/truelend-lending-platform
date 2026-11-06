"""POST /api/applications/{id}/review and /override, GET .../decision (E3-S5)."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

_DOCS = (("ID_PROOF", "id.png"), ("ADDRESS_PROOF", "addr.png"), ("SALARY_SLIP", "slip.png"))
_PRIOR_DEFAULT = {"prior_default": True, "missed_payment_12m": False, "thin_file": False}
_CLEAN = {"prior_default": False, "missed_payment_12m": False, "thin_file": False}
_REVIEW_OK = {"outcome": "APPROVE", "reason": "Stable income, documents verified"}
_OVERRIDE_OK = {
    "reason_code": "COMPENSATING_FACTORS",
    "comment": "Co-signed by parent; income verified",
}

Login = Callable[[str], dict[str, str]]


def _underwritten(
    client: TestClient, headers: dict[str, str], *, income: str, flags: dict[str, bool]
) -> int:
    body = {
        "product_type": "PERSONAL", "requested_amount": "200000.00", "tenure_months": 24,
        "age_years": 30, "monthly_income": income, "credit_flags": flags,
        "pan": "ABCDE1234F", "aadhaar": "123456789012",
    }
    created = client.post("/api/applications", json=body, headers=headers)
    assert created.status_code == 201, created.text
    app_id: int = created.json()["id"]
    for doc_type, filename in _DOCS:
        client.post(
            f"/api/applications/{app_id}/documents",
            json={"type": doc_type, "filename": filename}, headers=headers,
        )
    assert client.post(f"/api/applications/{app_id}/submit", headers=headers).status_code == 200
    assert client.post(f"/api/applications/{app_id}/underwrite", headers=headers).status_code == 200
    return app_id


def _manual_review(client: TestClient, login: Login) -> int:
    return _underwritten(client, login("customer1@example.test"), income="60000.00", flags=_CLEAN)


def _auto_reject(client: TestClient, login: Login) -> int:
    return _underwritten(
        client, login("customer1@example.test"), income="30000.00", flags=_PRIOR_DEFAULT
    )


def _audit_rows(client: TestClient, login: Login, app_id: int) -> list[dict[str, Any]]:
    r = client.get(
        "/api/audit", headers=login("admin@example.test"),
        params={"entity_type": "application", "entity_id": app_id},
    )
    assert r.status_code == 200, r.text
    items: list[dict[str, Any]] = r.json()["items"]
    return items


def _events(log_buffer: Any) -> list[dict[str, Any]]:
    lines = [json.loads(line) for line in log_buffer.getvalue().strip().splitlines() if line]
    return [line for line in lines if line["event"] == "ApplicationApproved"]


# tags: E3-S5-AC1
def test_e3_s5_ac1_underwriter_approves_manual_review(
    client: TestClient, login: Login, log_buffer: Any
) -> None:
    app_id = _manual_review(client, login)
    before = len(_events(log_buffer))
    r = client.post(
        f"/api/applications/{app_id}/review", json=_REVIEW_OK,
        headers=login("underwriter@example.test"),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPROVED"
    assert r.json()["resolution"]["kind"] == "MANUAL_REVIEW"
    assert r.json()["resolution"]["outcome"] == "APPROVED"
    row = _audit_rows(client, login, app_id)[-1]
    assert (row["action"], row["actor_user_id"]) == ("REVIEW_APPROVED", 3)
    assert (row["before_status"], row["after_status"]) == ("MANUAL_REVIEW", "APPROVED")
    assert row["comment"] == _REVIEW_OK["reason"]
    assert len(_events(log_buffer)) == before + 1


# tags: E3-S5-AC2
def test_e3_s5_ac2_underwriter_rejects_manual_review_without_event(
    client: TestClient, login: Login, log_buffer: Any
) -> None:
    app_id = _manual_review(client, login)
    before = len(_events(log_buffer))
    r = client.post(
        f"/api/applications/{app_id}/review",
        json={"outcome": "REJECT", "reason": "Income not evidenced"},
        headers=login("underwriter@example.test"),
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "REJECTED"
    assert _audit_rows(client, login, app_id)[-1]["action"] == "REVIEW_REJECTED"
    assert len(_events(log_buffer)) == before


def _assert_override_applied(
    client: TestClient, login: Login, app_id: int, actor_id: int, response: Any
) -> None:
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "APPROVED"
    decision = client.get(
        f"/api/applications/{app_id}/decision", headers=login("underwriter@example.test")
    ).json()
    assert decision["decision"] == "AUTO_REJECT"
    assert decision["resolution"]["kind"] == "OVERRIDE"
    row = _audit_rows(client, login, app_id)[-1]
    assert (row["action"], row["actor_user_id"]) == ("DECISION_OVERRIDDEN", actor_id)
    assert (row["before_status"], row["after_status"]) == ("REJECTED", "APPROVED")
    assert row["reason_code"] == response.request_body["reason_code"]
    assert row["comment"] == response.request_body["comment"]


def _override(
    client: TestClient, app_id: int, headers: dict[str, str], body: dict[str, str]
) -> Any:
    response = client.post(f"/api/applications/{app_id}/override", json=body, headers=headers)
    response.request_body = body
    return response


# tags: E3-S5-AC3
def test_e3_s5_ac3_admin_overrides_auto_reject(
    client: TestClient, login: Login, log_buffer: Any
) -> None:
    app_id = _auto_reject(client, login)
    before = len(_events(log_buffer))
    r = _override(client, app_id, login("admin@example.test"), _OVERRIDE_OK)
    _assert_override_applied(client, login, app_id, 1, r)
    assert len(_events(log_buffer)) == before + 1


# tags: E3-S5-AC4
def test_e3_s5_ac4_underwriter_overrides_with_data_correction(
    client: TestClient, login: Login
) -> None:
    app_id = _auto_reject(client, login)
    body = {"reason_code": "DATA_CORRECTION", "comment": "Income typo corrected"}
    r = _override(client, app_id, login("underwriter@example.test"), body)
    _assert_override_applied(client, login, app_id, 3, r)


# tags: E3-S5-AC5
def test_e3_s5_ac5_override_conflicts_and_validation(client: TestClient, login: Login) -> None:
    underwriter = login("underwriter@example.test")
    in_review = _manual_review(client, login)
    r = _override(client, in_review, underwriter, _OVERRIDE_OK)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "NOT_OVERRIDABLE")

    rejected = _auto_reject(client, login)
    assert _override(client, rejected, underwriter, _OVERRIDE_OK).status_code == 200
    again = _override(client, rejected, underwriter, _OVERRIDE_OK)
    assert (again.status_code, again.json()["error"]["code"]) == (409, "NOT_OVERRIDABLE")

    fresh = _auto_reject(client, login)
    foo = _override(client, fresh, underwriter, {"reason_code": "FOO", "comment": "x"})
    assert foo.status_code == 422
    empty = _override(client, fresh, underwriter, {"reason_code": "DATA_CORRECTION", "comment": ""})
    assert empty.status_code == 422
    assert "DECISION_OVERRIDDEN" not in [r["action"] for r in _audit_rows(client, login, fresh)]


# tags: E3-S5-AC5
def test_e3_s5_ac5_review_requires_manual_review_and_underwriter_role(
    client: TestClient, login: Login
) -> None:
    rejected = _auto_reject(client, login)
    r = client.post(
        f"/api/applications/{rejected}/review", json=_REVIEW_OK,
        headers=login("underwriter@example.test"),
    )
    assert (r.status_code, r.json()["error"]["code"]) == (409, "NOT_IN_REVIEW")

    in_review = _manual_review(client, login)
    for email in ("customer1@example.test", "admin@example.test", "policy@example.test"):
        forbidden = client.post(
            f"/api/applications/{in_review}/review", json=_REVIEW_OK, headers=login(email)
        )
        assert forbidden.status_code == 403, email
    customer = _override(client, rejected, login("customer1@example.test"), _OVERRIDE_OK)
    assert customer.status_code == 403
    assert client.post(f"/api/applications/{in_review}/review", json=_REVIEW_OK).status_code == 401


@pytest.mark.parametrize("reason", ["", "x" * 501])
def test_e3_s5_review_reason_length_is_1_to_500(
    client: TestClient, login: Login, reason: str
) -> None:
    app_id = _manual_review(client, login)
    r = client.post(
        f"/api/applications/{app_id}/review", json={"outcome": "APPROVE", "reason": reason},
        headers=login("underwriter@example.test"),
    )
    assert r.status_code == 422


def test_e3_s5_unknown_application_is_404(client: TestClient, login: Login) -> None:
    r = client.post(
        "/api/applications/9999/review", json=_REVIEW_OK, headers=login("underwriter@example.test")
    )
    assert r.status_code == 404


def test_e3_s5_failed_review_leaves_no_audit_row(client: TestClient, login: Login) -> None:
    rejected = _auto_reject(client, login)
    client.post(
        f"/api/applications/{rejected}/review", json=_REVIEW_OK,
        headers=login("underwriter@example.test"),
    )
    assert [r["action"] for r in _audit_rows(client, login, rejected)] == []


def test_e3_s5_resolution_rows_are_append_only(
    client: TestClient, login: Login, make_settings: Callable[[str | None], Any]
) -> None:
    app_id = _manual_review(client, login)
    client.post(
        f"/api/applications/{app_id}/review", json=_REVIEW_OK,
        headers=login("underwriter@example.test"),
    )
    conn = sqlite3.connect(make_settings("test").db_path)
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute(
            "UPDATE resolutions SET outcome = 'REJECTED' WHERE application_id = ?", (app_id,)
        )
    conn.close()


# tags: E3-S5-AC1
def test_e3_s5_decision_detail_for_staff_and_owner_only(
    client: TestClient, login: Login
) -> None:
    url = "/api/applications/{}/decision"
    app_id = _manual_review(client, login)
    r = client.get(url.format(app_id), headers=login("underwriter@example.test"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["decision"], body["score"], body["policy_version"]) == ("MANUAL_REVIEW", 680, 1)
    assert body["reason_codes"][0]["code"] == "SCORE_IN_REVIEW_BAND"
    assert body["reason_codes"][0]["message"] == "Credit score falls in the manual-review band."
    assert body["thresholds"] == {"auto_reject_below_score": 600, "auto_approve_min_score": 700}
    assert body["override_reason_codes"] == [
        "COMPENSATING_FACTORS", "DATA_CORRECTION", "SENIOR_APPROVAL",
    ]
    assert body["resolution"] is None
    owner = client.get(url.format(app_id), headers=login("customer1@example.test"))
    assert owner.status_code == 200
    other = client.get(url.format(app_id), headers=login("customer2@example.test"))
    assert other.status_code == 404


def test_e3_s5_decision_detail_404_before_underwriting(client: TestClient, login: Login) -> None:
    customer = login("customer1@example.test")
    body = {
        "product_type": "PERSONAL", "requested_amount": "200000.00", "tenure_months": 24,
        "age_years": 30, "monthly_income": "60000.00", "credit_flags": _CLEAN,
        "pan": "ABCDE1234F", "aadhaar": "123456789012",
    }
    app_id = client.post("/api/applications", json=body, headers=customer).json()["id"]
    r = client.get(f"/api/applications/{app_id}/decision", headers=customer)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "NOT_DECIDED")
