"""Error-envelope shape and HTTP status mapping for domain errors."""

from __future__ import annotations

from truelend.types.errors import (
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    PolicyViolationException,
    ValidationError,
)

STATUS_BY_ERROR_TYPE: dict[type[DomainError], int] = {
    ValidationError: 422,
    NotFoundError: 404,
    ForbiddenError: 403,
    ConflictError: 409,
    PolicyViolationException: 422,
}

CODE_BY_STATUS: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    500: "INTERNAL_ERROR",
}


def status_for_domain_error(exc: DomainError) -> int:
    for error_type, status_code in STATUS_BY_ERROR_TYPE.items():
        if isinstance(exc, error_type):
            return status_code
    return 400


def error_envelope(code: str, message: str, correlation_id: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message, "correlation_id": correlation_id}}
