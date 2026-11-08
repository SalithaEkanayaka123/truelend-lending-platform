"""E1-S1 AC5 / QA-VM-005: the TRUELEND_ENV=test fixture routes require ADMIN."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

_AUDIT_BODY = {"entity_type": "application", "entity_id": 1, "action": "X"}


def _call(client: TestClient, path: str, headers: dict[str, str] | None = None) -> int:
    if path.endswith("boom"):
        status: int = client.get(path, headers=headers).status_code
    else:
        status = client.post(path, headers=headers, json=_AUDIT_BODY).status_code
    return status


@pytest.mark.parametrize("path", ["/api/_test/boom", "/api/_test/audited-action"])
@pytest.mark.parametrize("email", ["customer1@example.test", "policy_editor@example.test"])
def test_e1_s1_ac5_test_routes_forbid_non_admin(
    client: TestClient, login: Callable[[str], dict[str, str]], path: str, email: str
) -> None:
    assert _call(client, path, login(email)) == 403


@pytest.mark.parametrize("path", ["/api/_test/boom", "/api/_test/audited-action"])
def test_e1_s1_ac5_test_routes_require_a_token(client: TestClient, path: str) -> None:
    assert _call(client, path) == 401


def test_e1_s1_ac5_test_routes_accept_admin(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    admin = login("admin@example.test")
    assert _call(client, "/api/_test/boom", admin) == 500
    assert _call(client, "/api/_test/audited-action", admin) == 200
