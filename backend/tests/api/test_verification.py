"""GET /api/verification-queue and POST /api/documents/{id}/verify
(E3-S1, VM-038..VM-042)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

_REQUIRED_DOCS = (
    ("ID_PROOF", "id.png"),
    ("ADDRESS_PROOF", "addr.png"),
    ("SALARY_SLIP", "slip.png"),
)


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


def _submitted_application(client: TestClient, headers: dict[str, str]) -> None:
    r = client.post("/api/applications", json=_body(), headers=headers)
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


def test_e3_s1_ac1_queue_lists_uploaded_documents_oldest_first(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    _submitted_application(client, login("customer1@example.test"))
    r = client.get("/api/verification-queue", headers=login("underwriter@example.test"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert [item["type"] for item in body["items"]] == ["ID_PROOF", "ADDRESS_PROOF", "SALARY_SLIP"]
    assert all(item["application_id"] == 1 for item in body["items"])
    assert body["items"][0]["document_id"] == 1


def test_e3_s1_ac2_verify_sets_verified_writes_audit_and_leaves_queue(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    _submitted_application(client, login("customer1@example.test"))
    underwriter = login("underwriter@example.test")
    r = client.post(
        "/api/documents/1/verify",
        json={"outcome": "VERIFIED", "reason": "Name matches PAN record"},
        headers=underwriter,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "VERIFIED"
    assert body["verified_by"] == 3

    admin = login("admin@example.test")
    audit = client.get(
        "/api/audit", headers=admin, params={"entity_type": "document", "entity_id": 1}
    ).json()
    assert audit["items"][-1]["action"] == "DOCUMENT_VERIFIED"

    queue = client.get("/api/verification-queue", headers=underwriter).json()
    assert all(item["document_id"] != 1 for item in queue["items"])


def test_e3_s1_ac3_reject_sets_rejected_with_reason_and_application_stays_submitted(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    _submitted_application(client, login("customer1@example.test"))
    underwriter = login("underwriter@example.test")
    r = client.post(
        "/api/documents/2/verify",
        json={"outcome": "REJECTED", "reason": "Image unreadable"},
        headers=underwriter,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "REJECTED"
    assert body["reason"] == "Image unreadable"

    admin = login("admin@example.test")
    audit = client.get(
        "/api/audit", headers=admin, params={"entity_type": "document", "entity_id": 2}
    ).json()
    assert audit["items"][-1]["action"] == "DOCUMENT_REJECTED"

    app_status = client.get("/api/applications/1", headers=underwriter).json()["status"]
    assert app_status == "SUBMITTED"


def test_e3_s1_ac4_invalid_reason_is_422_with_no_audit_row(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    _submitted_application(client, login("customer1@example.test"))
    underwriter = login("underwriter@example.test")
    admin = login("admin@example.test")

    for reason in (None, "", "x" * 501):
        payload: dict[str, Any] = {"outcome": "VERIFIED"}
        if reason is not None:
            payload["reason"] = reason
        r = client.post("/api/documents/3/verify", json=payload, headers=underwriter)
        assert r.status_code == 422, r.text
        assert r.json()["error"]["code"] == "VALIDATION_ERROR"

    audit = client.get(
        "/api/audit", headers=admin, params={"entity_type": "document", "entity_id": 3}
    ).json()
    assert audit["items"] == []


def test_e3_s1_ac5_customer_forbidden_and_reverify_is_already_verified(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    customer = login("customer1@example.test")
    _submitted_application(client, customer)
    underwriter = login("underwriter@example.test")

    assert client.get("/api/verification-queue", headers=customer).status_code == 403
    assert (
        client.post(
            "/api/documents/1/verify",
            json={"outcome": "VERIFIED", "reason": "ok"},
            headers=customer,
        ).status_code
        == 403
    )

    first = client.post(
        "/api/documents/1/verify",
        json={"outcome": "VERIFIED", "reason": "Name matches PAN record"},
        headers=underwriter,
    )
    assert first.status_code == 200, first.text
    second = client.post(
        "/api/documents/1/verify",
        json={"outcome": "VERIFIED", "reason": "Name matches PAN record"},
        headers=underwriter,
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ALREADY_VERIFIED"
