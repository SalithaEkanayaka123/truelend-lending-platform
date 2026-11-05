"""POST /api/applications and GET /api/applications/{id} (E2-S2)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient


def _body(**overrides: Any) -> dict[str, Any]:
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


def _apply(
    client: TestClient, headers: dict[str, str], **overrides: Any
) -> dict[str, Any]:
    r = client.post("/api/applications", json=_body(**overrides), headers=headers)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def test_e2_s2_ac1_customer_can_apply_for_personal_loan(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    body = _apply(client, login("customer1@example.test"))
    assert body["id"] == 1
    assert body["status"] == "DRAFT"
    assert body["applicant_user_id"] == 4


def test_e2_s2_ac2_checklist_matches_product_required_documents(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    personal = _apply(client, headers)
    vehicle = _apply(client, headers, product_type="VEHICLE", requested_amount="300000.00")
    education = _apply(client, headers, product_type="EDUCATION", requested_amount="300000.00")
    personal_docs = {(d["type"], d["status"]) for d in personal["required_documents"]}
    assert personal_docs == {
        ("ID_PROOF", "MISSING"),
        ("ADDRESS_PROOF", "MISSING"),
        ("SALARY_SLIP", "MISSING"),
    }
    assert len(vehicle["required_documents"]) == 4
    assert "VEHICLE_QUOTATION" in {d["type"] for d in vehicle["required_documents"]}
    education_types = {d["type"] for d in education["required_documents"]}
    assert {"ADMISSION_LETTER", "FEE_STRUCTURE"} <= education_types


def test_e2_s2_ac3_tenure_out_of_range_is_422(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    r = client.post("/api/applications", json=_body(tenure_months=72), headers=headers)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "TENURE_OUT_OF_RANGE"


def test_e2_s2_ac3_amount_out_of_range_is_422(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    r = client.post(
        "/api/applications", json=_body(requested_amount="10000.00"), headers=headers
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "AMOUNT_OUT_OF_RANGE"


def test_e2_s2_ac4_malformed_pan_or_aadhaar_is_validation_error(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    bad_pan = client.post("/api/applications", json=_body(pan="abc"), headers=headers)
    bad_aadhaar = client.post(
        "/api/applications", json=_body(aadhaar="12345678901"), headers=headers
    )
    assert bad_pan.status_code == 422
    assert bad_pan.json()["error"]["code"] == "VALIDATION_ERROR"
    assert bad_aadhaar.status_code == 422
    assert bad_aadhaar.json()["error"]["code"] == "VALIDATION_ERROR"


def test_e2_s2_ac4_valid_application_masks_pan_and_aadhaar(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    r = client.post("/api/applications", json=_body(), headers=headers)
    body = r.json()
    assert body["pan_masked"] == "******234F"
    assert body["aadhaar_masked"] == "********9012"
    assert "pan" not in body
    assert "aadhaar" not in body
    assert "ABCDE1234F" not in r.text
    assert "123456789012" not in r.text


def test_e2_s2_ac5_other_customer_gets_404(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    owner_headers = login("customer1@example.test")
    _apply(client, owner_headers)
    other_headers = login("customer2@example.test")
    r = client.get("/api/applications/1", headers=other_headers)
    assert r.status_code == 404


def test_e2_s2_owner_can_read_their_own_application(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    _apply(client, headers)
    r = client.get("/api/applications/1", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == 1


def test_e2_s2_policy_editor_is_forbidden_from_reading_an_application(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    _apply(client, login("customer1@example.test"))
    r = client.get("/api/applications/1", headers=login("policy@example.test"))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"
