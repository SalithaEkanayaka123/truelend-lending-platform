"""User lookups by email (login) and by id (token resolution)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import cast

from truelend.types.enums import Role

_COLUMNS = "id, email, role, password_hash, display_name"


@dataclass(frozen=True)
class UserRecord:
    """A row from `users`. Never crosses the API boundary directly."""

    id: int
    email: str
    role: Role
    password_hash: str
    display_name: str | None = None


def find_by_email(conn: sqlite3.Connection, email: str) -> UserRecord | None:
    row = conn.execute(f"SELECT {_COLUMNS} FROM users WHERE email = ?", (email,)).fetchone()
    return _to_record(row)


def find_by_id(conn: sqlite3.Connection, user_id: int) -> UserRecord | None:
    row = conn.execute(f"SELECT {_COLUMNS} FROM users WHERE id = ?", (user_id,)).fetchone()
    return _to_record(row)


def display_names(conn: sqlite3.Connection, user_ids: set[int]) -> dict[int, str | None]:
    """Display name per user id (None when unset or the user is unknown)."""
    if not user_ids:
        return {}
    marks = ",".join("?" for _ in user_ids)
    rows = conn.execute(
        f"SELECT id, display_name FROM users WHERE id IN ({marks})", tuple(user_ids)
    ).fetchall()
    return {int(uid): name for uid, name in rows}


def _to_record(row: tuple[int, str, str, str, str | None] | None) -> UserRecord | None:
    if row is None:
        return None
    user_id, email, role, password_hash, display_name = row
    return UserRecord(
        id=user_id,
        email=email,
        role=cast(Role, role),
        password_hash=password_hash,
        display_name=display_name,
    )
