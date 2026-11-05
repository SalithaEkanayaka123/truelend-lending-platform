"""GET /api/products (E2-S1): the active policy's product catalog."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient


def test_e2_s1_ac1_returns_exactly_3_products_at_version_1(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("customer1@example.test")
    r = client.get("/api/products", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 3
    assert {p["product_type"] for p in body} == {"PERSONAL", "VEHICLE", "EDUCATION"}
    assert all(p["policy_version"] == 1 for p in body)


def test_e2_s1_ac2_min_income_differs_by_product(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("underwriter@example.test")
    body = client.get("/api/products", headers=headers).json()
    by_type = {p["product_type"]: p for p in body}
    assert by_type["PERSONAL"]["min_income"] == "25000.00"
    assert by_type["VEHICLE"]["min_income"] == "30000.00"
    assert by_type["EDUCATION"]["min_income"] == "20000.00"


def test_e2_s1_ac3_required_documents_counts_by_product(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    headers = login("policy@example.test")
    body = client.get("/api/products", headers=headers).json()
    by_type = {p["product_type"]: p for p in body}
    assert len(by_type["PERSONAL"]["required_documents"]) == 3
    assert len(by_type["VEHICLE"]["required_documents"]) == 4
    assert len(by_type["EDUCATION"]["required_documents"]) == 4


def test_e2_s1_ac4_missing_token_is_401(client: TestClient) -> None:
    r = client.get("/api/products")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_e2_s1_any_authenticated_role_can_read_the_catalog(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    for email in (
        "admin@example.test",
        "policy@example.test",
        "underwriter@example.test",
        "customer1@example.test",
    ):
        headers = login(email)
        assert client.get("/api/products", headers=headers).status_code == 200
