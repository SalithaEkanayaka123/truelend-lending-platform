"""FastAPI application factory: health, migration/seed lifespan, and the
shared error-envelope exception handlers.

Cross-story insertion points (coordinate with the lead, do not pre-guess the
shape): E1-S1 adds the auth router; E1-S3 adds the correlation-id/access-log
middleware. Both are marked inside `create_app` below.
"""

from __future__ import annotations

import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from truelend.api import (
    applications_router,
    audit_router,
    auth_router,
    documents_router,
    health_router,
    policies_router,
    products_router,
)
from truelend.api.deps import get_clock, get_conn, get_current_principal
from truelend.api.middleware import CorrelationIdLoggingMiddleware
from truelend.config.db import get_connection, run_migrations, seed_users
from truelend.config.errors import CODE_BY_STATUS, error_envelope, status_for_domain_error
from truelend.config.logging import configure_logging
from truelend.config.settings import Settings, get_settings
from truelend.repository import audit_repo
from truelend.service import policy_service
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.errors import ConflictError, DomainError, MissingDocumentsError

# The seeded ADMIN user is always id 1 (config.db.seed_users inserts it
# first); the policy catalog's seed version is recorded as created/approved
# by that user.
_SEED_ADMIN_USER_ID = 1


class _SystemClock:
    """Default `Clock`: wall-clock time. Tests inject a fake instead."""

    def now(self) -> datetime:
        return datetime.now(UTC)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    conn = get_connection(settings)
    run_migrations(conn, settings.migrations_dir)
    seed_users(conn)
    policy_service.seed_policy_version_one(
        conn, settings.policies_dir, clock=app.state.clock, created_by=_SEED_ADMIN_USER_ID
    )
    policy_service.verify_policy_checksums(conn, settings.policies_dir)
    app.state.conn = conn
    try:
        yield
    finally:
        conn.close()


def _correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", None) or str(uuid4())


def _domain_error_body(exc: DomainError, correlation_id: str) -> dict[str, dict[str, object]]:
    error_body: dict[str, object] = {
        "code": exc.code,
        "message": str(exc),
        "correlation_id": correlation_id,
    }
    if isinstance(exc, MissingDocumentsError):
        error_body["missing"] = exc.missing
    return {"error": error_body}


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, DomainError)
        status_code = status_for_domain_error(exc)
        body = _domain_error_body(exc, _correlation_id(request))
        return JSONResponse(status_code=status_code, content=body)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, StarletteHTTPException)
        code = CODE_BY_STATUS.get(exc.status_code, "HTTP_ERROR")
        body = error_envelope(code, str(exc.detail), _correlation_id(request))
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, RequestValidationError)
        body = error_envelope("VALIDATION_ERROR", "Invalid request.", _correlation_id(request))
        return JSONResponse(status_code=422, content=body)

    @app.exception_handler(Exception)
    async def _unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        body = error_envelope(
            "INTERNAL_ERROR", "An unexpected error occurred.", _correlation_id(request)
        )
        return JSONResponse(status_code=500, content=body)


def _register_test_boom_route(app: FastAPI, settings: Settings) -> None:
    """`/api/_test/boom`: only mounted when `env == "test"`, for the 500-path
    test (E1-S3). Raises unconditionally; not exercised by E1-S4's own ACs.
    """
    if settings.env != "test":
        return

    @app.get(
        "/api/_test/boom",
        include_in_schema=False,
        dependencies=[Depends(get_current_principal)],
    )
    async def _boom() -> None:
        raise RuntimeError("boom")


class _TestAuditedActionRequest(BaseModel):
    """Body for `/api/_test/audited-action` (E1-S2 AC1/AC4 test fixture)."""

    entity_type: str
    entity_id: int
    action: str
    fail: bool = False


def _audited_action_handler(
    body: _TestAuditedActionRequest,
    request: Request,
    principal: AuthPrincipal,
    conn: sqlite3.Connection,
    clock: Clock,
) -> dict[str, str]:
    audit_repo.insert(
        conn,
        clock,
        actor=principal,
        action=body.action,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        correlation_id=_correlation_id(request),
    )
    if body.fail:
        conn.rollback()
        raise ConflictError("TEST_CONFLICT", "Simulated action failure.")
    conn.commit()
    return {"status": "ok"}


def _register_test_audit_route(app: FastAPI, settings: Settings) -> None:
    """`/api/_test/audited-action`: only mounted when `env == "test"`
    (E1-S2 AC1/AC4). Writes the audit row in the action's own transaction;
    `fail=True` rolls both back and raises a 409 through the DomainError
    envelope.
    """
    if settings.env != "test":
        return

    @app.post("/api/_test/audited-action", include_in_schema=False)
    def _audited_action(
        body: _TestAuditedActionRequest,
        request: Request,
        principal: AuthPrincipal = Depends(get_current_principal),
        conn: sqlite3.Connection = Depends(get_conn),
        clock: Clock = Depends(get_clock),
    ) -> dict[str, str]:
        return _audited_action_handler(body, request, principal, conn, clock)


def create_app(settings: Settings | None = None, clock: Clock | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging()  # JSON lines to stderr; without this the access/500 log is dropped
    app = FastAPI(lifespan=_lifespan)
    app.state.settings = resolved_settings
    app.state.clock = clock or _SystemClock()

    app.include_router(health_router.router)
    app.include_router(auth_router.router)
    app.include_router(audit_router.router)
    app.include_router(products_router.router)
    app.include_router(policies_router.router)
    app.include_router(applications_router.router)
    app.include_router(documents_router.router)
    app.add_middleware(CorrelationIdLoggingMiddleware)

    _register_test_boom_route(app, resolved_settings)
    _register_test_audit_route(app, resolved_settings)
    _register_exception_handlers(app)
    return app
