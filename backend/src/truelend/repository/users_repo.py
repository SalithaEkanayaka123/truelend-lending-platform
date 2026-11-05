"""User lookups by email (login) and by id (token resolution)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import cast

from truelend.types.enums import Role


@dataclass(frozen=True)
class UserRecord:
    """A row from `users`. Never crosses the API boundary directly."""

    id: int
    email: str
    role: Role
    password_hash: str


def find_by_email(conn: sqlite3.Connection, email: str) -> UserRecord | None:
    row = conn.execute(
        "SELECT id, email, role, password_hash FROM users WHERE email = ?", (email,)
    ).fetchone()
    return _to_record(row)


def find_by_id(conn: sqlite3.Connection, user_id: int) -> UserRecord | None:
    row = conn.execute(
        "SELECT id, email, role, password_hash FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    return _to_record(row)


def _to_record(row: tuple[int, str, str, str] | None) -> UserRecord | None:
    if row is None:
        return None
    user_id, email, role, password_hash = row
    return UserRecord(id=user_id, email=email, role=cast(Role, role), password_hash=password_hash)
