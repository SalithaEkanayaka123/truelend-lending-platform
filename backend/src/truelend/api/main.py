"""FastAPI application factory: health, migration/seed lifespan, and the
shared error-envelope exception handlers.

Cross-story insertion points (coordinate with the lead, do not pre-guess the
shape): E1-S1 adds the auth router; E1-S3 adds the correlation-id/access-log
middleware. Both are marked inside `create_app` below.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from truelend.api import auth_router, health_router
from truelend.api.deps import get_current_principal
from truelend.api.middleware import CorrelationIdLoggingMiddleware
from truelend.config.db import get_connection, run_migrations, seed_users
from truelend.config.errors import CODE_BY_STATUS, error_envelope, status_for_domain_error
from truelend.config.settings import Settings, get_settings
from truelend.types.contracts import Clock
from truelend.types.errors import DomainError


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
    app.state.conn = conn
    try:
        yield
    finally:
        conn.close()


def _correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", None) or str(uuid4())


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain_error(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, DomainError)
        status_code = status_for_domain_error(exc)
        body = error_envelope(exc.code, str(exc), _correlation_id(request))
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


def create_app(settings: Settings | None = None, clock: Clock | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    app = FastAPI(lifespan=_lifespan)
    app.state.settings = resolved_settings
    app.state.clock = clock or _SystemClock()

    app.include_router(health_router.router)
    app.include_router(auth_router.router)
    app.add_middleware(CorrelationIdLoggingMiddleware)

    _register_test_boom_route(app, resolved_settings)
    _register_exception_handlers(app)
    return app
