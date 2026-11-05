"""POST /api/applications/{id}/documents and .../submit (E2-S3)."""

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


def _apply(client: TestClient, headers: dict[str, str]) -> dict[str, Any]:
    r = client.post("/api/applications", json=_body(), headers=headers)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def _upload(
    client: TestClient, headers: dict[str, str], application_id: int, doc_type: str, filename: str
) -> Any:
    return client.post(
        f"/api/applications/{application_id}/documents",
        json={"type": doc_type, "filename": filename},
        headers=headers,
    )


def test_e2_s3_ac1_owner_can_upload_a_required_document(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    _apply(client, headers)
    r = _upload(client, headers, 1, "ID_PROOF", "id_front.png")
    assert r.status_code == 201, r.text
    doc = next(d for d in r.json()["required_documents"] if d["type"] == "ID_PROOF")
    assert doc["status"] == "UPLOADED"
    assert doc["filename"] == "id_front.png"


def test_e2_s3_ac1_non_owner_upload_is_404(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    _apply(client, login("customer1@example.test"))
    other_headers = login("customer2@example.test")
    r = _upload(client, other_headers, 1, "ID_PROOF", "id_front.png")
    assert r.status_code == 404


def test_e2_s3_ac1_rejected_document_reupload_resets_to_uploaded(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    _apply(client, headers)
    first = _upload(client, headers, 1, "ID_PROOF", "blurry.png")
    assert first.status_code == 201, first.text
    second = _upload(client, headers, 1, "ID_PROOF", "clear.png")
    assert second.status_code == 201, second.text
    doc = next(d for d in second.json()["required_documents"] if d["type"] == "ID_PROOF")
    assert doc["status"] == "UPLOADED"
    assert doc["filename"] == "clear.png"


def test_e2_s3_ac2_document_type_not_on_checklist_is_422(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    _apply(client, headers)
    r = _upload(client, headers, 1, "VEHICLE_QUOTATION", "quote.png")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "DOCUMENT_TYPE_NOT_REQUIRED"


def test_e2_s3_ac3_submit_with_missing_document_is_409(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    _apply(client, headers)
    _upload(client, headers, 1, "ID_PROOF", "id.png")
    _upload(client, headers, 1, "ADDRESS_PROOF", "addr.png")
    r = client.post("/api/applications/1/submit", headers=headers)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "MISSING_DOCUMENTS"
    assert r.json()["error"]["missing"] == ["SALARY_SLIP"]
    get_r = client.get("/api/applications/1", headers=headers)
    assert get_r.json()["status"] == "DRAFT"


def test_e2_s3_ac4_submit_succeeds_once_all_documents_uploaded(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    _apply(client, headers)
    _upload(client, headers, 1, "ID_PROOF", "id.png")
    _upload(client, headers, 1, "ADDRESS_PROOF", "addr.png")
    _upload(client, headers, 1, "SALARY_SLIP", "slip.png")
    r = client.post("/api/applications/1/submit", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "SUBMITTED"
    assert body["policy_version"] == 1
    assert body["submitted_at"] is not None


def test_e2_s3_ac5_submit_twice_is_already_submitted(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    _apply(client, headers)
    _upload(client, headers, 1, "ID_PROOF", "id.png")
    _upload(client, headers, 1, "ADDRESS_PROOF", "addr.png")
    _upload(client, headers, 1, "SALARY_SLIP", "slip.png")
    first = client.post("/api/applications/1/submit", headers=headers)
    assert first.status_code == 200, first.text
    second = client.post("/api/applications/1/submit", headers=headers)
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "ALREADY_SUBMITTED"


def test_e2_s3_non_customer_role_is_forbidden_from_uploading(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    _apply(client, login("customer1@example.test"))
    underwriter_headers = login("underwriter@example.test")
    r = _upload(client, underwriter_headers, 1, "ID_PROOF", "id.png")
    assert r.status_code == 403
