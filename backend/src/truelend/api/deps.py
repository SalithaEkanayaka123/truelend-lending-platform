"""Shared FastAPI dependencies: connection/settings/clock providers, the
bearer-token auth guard (`get_current_principal`), and the role guard
(`require_roles`).
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable, Iterator
from typing import cast

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from truelend.config.db import get_connection
from truelend.config.settings import Settings
from truelend.service.auth_service import InvalidTokenError, resolve_principal
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import Role

_bearer_scheme = HTTPBearer(auto_error=False)


def get_conn(request: Request) -> Iterator[sqlite3.Connection]:
    """A per-request connection, not the lifespan's shared one: sync route
    handlers each run in their own thread pool thread, and a `sqlite3.
    Connection` may only be used on the thread that created it."""
    conn = get_connection(cast(Settings, request.app.state.settings))
    try:
        yield conn
    finally:
        conn.close()


def get_app_settings(request: Request) -> Settings:
    return cast(Settings, request.app.state.settings)


def get_clock(request: Request) -> Clock:
    return cast(Clock, request.app.state.clock)


def get_current_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    conn: sqlite3.Connection = Depends(get_conn),
    settings: Settings = Depends(get_app_settings),
    clock: Clock = Depends(get_clock),
) -> AuthPrincipal:
    """Bearer-token guard. Raises 401 for missing/malformed/expired/tampered
    tokens or a token whose subject no longer exists."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header.")
    try:
        principal = resolve_principal(conn, settings, clock, credentials.credentials)
    except InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token.") from exc
    return cast(AuthPrincipal, principal)


def require_roles(*roles: Role) -> Callable[[AuthPrincipal], AuthPrincipal]:
    """Role guard factory: `Depends(require_roles("ADMIN"))` on a route."""
    allowed = set(roles)

    def _guard(principal: AuthPrincipal = Depends(get_current_principal)) -> AuthPrincipal:
        if principal.role not in allowed:
            raise HTTPException(status_code=403, detail="Insufficient role for this action.")
        return principal

    return _guard
