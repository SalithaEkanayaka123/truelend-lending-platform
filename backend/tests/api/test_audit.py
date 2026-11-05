"""E1-S2: GET /api/audit and the env=test audited-action route (VM-006..VM-009)."""

from __future__ import annotations

from collections.abc import Callable
from typing import cast

from fastapi.testclient import TestClient
from httpx import Response


def _audited(
    client: TestClient,
    headers: dict[str, str],
    entity_id: int,
    action: str = "REVIEW_APPROVED",
    fail: bool = False,
) -> Response:
    return cast(
        Response,
        client.post(
            "/api/_test/audited-action",
            headers=headers,
            json={
                "entity_type": "application",
                "entity_id": entity_id,
                "action": action,
                "fail": fail,
            },
        ),
    )


def test_e1_s2_ac1_audit_row_matches_actor_entity_and_correlation_id(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    underwriter = login("underwriter@example.test")
    admin = login("admin@example.test")
    r = _audited(client, underwriter, entity_id=7)
    assert r.status_code == 200
    correlation_id = r.headers["X-Correlation-ID"]

    body = client.get(
        "/api/audit", headers=admin, params={"entity_type": "application", "entity_id": 7}
    ).json()
    entry = body["items"][0]
    assert entry["actor_user_id"] == 3
    assert entry["actor_role"] == "UNDERWRITER"
    assert entry["correlation_id"] == correlation_id


def test_e1_s2_ac3_action_filter_narrows_results(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    underwriter = login("underwriter@example.test")
    admin = login("admin@example.test")
    _audited(client, underwriter, entity_id=10, action="REVIEW_APPROVED")
    _audited(client, underwriter, entity_id=10, action="REVIEW_REJECTED")

    body = client.get(
        "/api/audit",
        headers=admin,
        params={"entity_type": "application", "entity_id": 10, "action": "REVIEW_REJECTED"},
    ).json()
    assert body["total"] == 1
    assert body["items"][0]["action"] == "REVIEW_REJECTED"


def test_e1_s2_ac4_failed_action_leaves_no_audit_row(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    underwriter = login("underwriter@example.test")
    admin = login("admin@example.test")
    r = _audited(client, underwriter, entity_id=99, fail=True)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "TEST_CONFLICT"

    body = client.get(
        "/api/audit", headers=admin, params={"entity_type": "application", "entity_id": 99}
    ).json()
    assert body["items"] == []
    assert body["total"] == 0


def test_e1_s2_audit_requires_admin_role(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    underwriter = login("underwriter@example.test")
    r = client.get("/api/audit", headers=underwriter)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"
