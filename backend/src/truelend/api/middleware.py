"""Correlation-id and access-log middleware (E1-S3).

Resolves/echoes `X-Correlation-ID`, emits exactly one redacted JSON access-log
line per request, and converts any exception the app did not otherwise handle
into the shared 500 error envelope. Never logs request/response bodies.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from truelend.config.errors import error_envelope
from truelend.config.logging import resolve_correlation_id, set_correlation_id

_logger = logging.getLogger("truelend.access")
_CORRELATION_HEADER = "X-Correlation-ID"


class CorrelationIdLoggingMiddleware(BaseHTTPMiddleware):
    """Per-request correlation id + single access-log line + 500 envelope."""

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        correlation_id = resolve_correlation_id(request.headers.get(_CORRELATION_HEADER))
        request.state.correlation_id = correlation_id
        set_correlation_id(correlation_id)
        started = time.monotonic()
        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001 - converted to the 500 envelope below
            response = self._error_response(correlation_id)
            self._log(request, correlation_id, response.status_code, started, exc=exc)
            return response
        response.headers[_CORRELATION_HEADER] = correlation_id
        self._log(request, correlation_id, response.status_code, started)
        return response

    @staticmethod
    def _error_response(correlation_id: str) -> JSONResponse:
        body = error_envelope("INTERNAL_ERROR", "An unexpected error occurred.", correlation_id)
        response = JSONResponse(status_code=500, content=body)
        response.headers[_CORRELATION_HEADER] = correlation_id
        return response

    @staticmethod
    def _log(
        request: Request,
        correlation_id: str,
        status_code: int,
        started: float,
        exc: Exception | None = None,
    ) -> None:
        duration_ms = round((time.monotonic() - started) * 1000, 2)
        fields = {
            "method": request.method,
            "path": request.url.path,
            "status": status_code,
            "duration_ms": duration_ms,
            "correlation_id": correlation_id,
        }
        level = logging.ERROR if exc is not None else logging.INFO
        _logger.log(level, "request_handled", exc_info=exc, extra={"fields": fields})
