"""Login and bearer-token issuance/verification.

Passwords are verified with `config.db`'s scrypt primitives (never
reimplemented here). Tokens are a stdlib HS256 JWT: the signature is always
recomputed as HMAC-SHA256 over the token's own header/payload segments, so
there is no "alg" to attacker-control -- we never branch on the header.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import sqlite3
from dataclasses import dataclass
from typing import cast

from truelend.config.db import hash_password, verify_password
from truelend.config.settings import Settings
from truelend.repository.users_repo import find_by_email, find_by_id
from truelend.types.contracts import Clock
from truelend.types.enums import Role

# Hashed once at import time so an unknown email is checked against a real
# scrypt hash too -- same code path, same rough cost, as a known email with
# the wrong password. No user enumeration via status code or timing.
_DUMMY_HASH = hash_password("not-a-real-password-used-only-for-timing-parity")


class InvalidCredentialsError(Exception):
    """Login failed: unknown email or wrong password. Maps to a uniform 401."""


class InvalidTokenError(Exception):
    """Token missing, malformed, tampered, expired, or for a deleted user."""


@dataclass(frozen=True)
class IssuedToken:
    access_token: str
    token_type: str
    expires_in: int
    role: Role
    display_name: str | None


@dataclass(frozen=True)
class Principal:
    """Concrete `AuthPrincipal` (types.contracts) for the resolved caller."""

    user_id: int
    email: str
    role: Role


def login(
    conn: sqlite3.Connection, settings: Settings, clock: Clock, email: str, password: str
) -> IssuedToken:
    user = find_by_email(conn, email)
    password_hash = user.password_hash if user is not None else _DUMMY_HASH
    valid = verify_password(password, password_hash)
    if user is None or not valid:
        raise InvalidCredentialsError("Invalid email or password.")
    token = _issue_token(settings, clock, user.id, user.role)
    return IssuedToken(
        access_token=token,
        token_type="bearer",
        expires_in=settings.jwt_expires_seconds,
        role=user.role,
        display_name=user.display_name,
    )


def resolve_principal(
    conn: sqlite3.Connection, settings: Settings, clock: Clock, token: str
) -> Principal:
    claims = _verify_token(settings, clock, token)
    sub = claims.get("sub")
    if not isinstance(sub, int):
        raise InvalidTokenError("Malformed token subject.")
    user = find_by_id(conn, sub)
    if user is None:
        raise InvalidTokenError("Token subject no longer exists.")
    return Principal(user_id=user.id, email=user.email, role=user.role)


def _issue_token(settings: Settings, clock: Clock, user_id: int, role: Role) -> str:
    now = int(clock.now().timestamp())
    header: dict[str, object] = {"alg": "HS256", "typ": "JWT"}
    payload: dict[str, object] = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + settings.jwt_expires_seconds,
    }
    signing_input = f"{_b64(header)}.{_b64(payload)}"
    return f"{signing_input}.{_sign(signing_input, settings.jwt_secret)}"


def _verify_token(settings: Settings, clock: Clock, token: str) -> dict[str, object]:
    try:
        header_b64, payload_b64, signature = token.split(".")
    except ValueError as exc:
        raise InvalidTokenError("Malformed token.") from exc
    expected = _sign(f"{header_b64}.{payload_b64}", settings.jwt_secret)
    if not hmac.compare_digest(expected, signature):
        raise InvalidTokenError("Invalid token signature.")
    claims = _unb64(payload_b64)
    exp = claims.get("exp")
    if not isinstance(exp, int) or exp < int(clock.now().timestamp()):
        raise InvalidTokenError("Token expired.")
    return claims


def _b64(obj: dict[str, object]) -> str:
    raw = json.dumps(obj, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _unb64(data: str) -> dict[str, object]:
    padded = data + "=" * (-len(data) % 4)
    try:
        result = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (ValueError, UnicodeDecodeError) as exc:
        raise InvalidTokenError("Malformed token payload.") from exc
    if not isinstance(result, dict):
        raise InvalidTokenError("Malformed token payload.")
    return cast(dict[str, object], result)


def _sign(signing_input: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), signing_input.encode("utf-8"), hashlib.sha256)
    return base64.urlsafe_b64encode(digest.digest()).rstrip(b"=").decode("ascii")
