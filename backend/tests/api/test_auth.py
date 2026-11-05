"""E1-S1: authentication and role guard (VM-001..VM-005)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi import routing as fastapi_routing
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from truelend.api.deps import get_current_principal
from truelend.config.db import DEMO_PASSWORD

from ..conftest import FakeClock


def _calls(dep: Any) -> set[Any]:
    found = {dep.call}
    for sub in dep.dependencies:
        found |= _calls(sub)
    return found


def test_e1_s1_ac1_login_returns_token_role_and_lifetime(client: TestClient) -> None:
    r = client.post(
        "/api/auth/login", json={"email": "customer1@example.test", "password": DEMO_PASSWORD}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["expires_in"] == 1800
    assert body["role"] == "CUSTOMER"
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_e1_s1_ac2_wrong_password_uniform_401(client: TestClient) -> None:
    known = client.post(
        "/api/auth/login", json={"email": "customer1@example.test", "password": "nope"}
    )
    unknown = client.post(
        "/api/auth/login", json={"email": "ghost@example.test", "password": "nope"}
    )
    assert known.status_code == unknown.status_code == 401
    assert known.json()["error"]["code"] == "UNAUTHENTICATED"
    assert "access_token" not in known.text
    k, u = known.json(), unknown.json()
    k["error"].pop("correlation_id")
    u["error"].pop("correlation_id")
    assert k == u


def test_e1_s1_ac3_me_requires_valid_unexpired_token(
    client: TestClient, clock: FakeClock, login: Callable[[str], dict[str, str]]
) -> None:
    assert client.get("/api/auth/me").status_code == 401
    h = login("customer1@example.test")
    ok = client.get("/api/auth/me", headers=h)
    assert ok.status_code == 200
    assert ok.json() == {"user_id": 4, "email": "customer1@example.test", "role": "CUSTOMER"}
    clock.advance(1800)
    assert client.get("/api/auth/me", headers=h).status_code == 200
    clock.advance(1)
    assert client.get("/api/auth/me", headers=h).status_code == 401


def test_e1_s1_ac3_tampered_and_garbage_tokens_rejected(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    tok = login("customer1@example.test")["Authorization"].split()[1]
    forged = tok[:-2] + ("AA" if not tok.endswith("AA") else "BB")
    for bad in (forged, "garbage", "a.b.c"):
        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"})
        assert r.status_code == 401


@pytest.mark.xfail(strict=True, reason="needs /api/audit from E1-S2")
def test_e1_s1_ac4_customer_forbidden_on_audit(
    client: TestClient, login: Callable[[str], dict[str, str]]
) -> None:
    r = client.get("/api/audit", headers=login("customer1@example.test"))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "FORBIDDEN"
    assert client.get("/api/audit", headers=login("admin@example.test")).status_code == 200
    assert client.get("/api/audit").status_code == 401


def _api_routes(app: FastAPI) -> list[APIRoute]:
    """Flatten `app.routes` to the real `APIRoute`s, recursing through any
    included routers (fastapi>=0.162 wraps `include_router()` targets in an
    opaque route-context object instead of exposing flat `APIRoute`s)."""
    routes = []
    for ctx in fastapi_routing.iter_route_contexts(app.routes):
        original = ctx.original_route
        if isinstance(original, APIRoute):
            routes.append(original)
    return routes


def test_e1_s1_ac5_every_route_but_login_and_health_is_guarded(client: TestClient) -> None:
    app: FastAPI = client.app  # type: ignore[assignment]
    assert client.get("/openapi.json").status_code == 200
    public = {("/api/auth/login", "POST"), ("/health", "GET")}
    unguarded = []
    routes = _api_routes(app)
    for route in routes:
        if any((route.path, m) in public for m in route.methods or set()):
            continue
        if get_current_principal not in _calls(route.dependant):
            unguarded.append(route.path)
    assert unguarded == []
    assert any(route.path == "/api/_test/boom" for route in routes)
    assert any(route.path == "/api/auth/login" for route in routes)
