"""Audit log repository (E1-S2): append-only insert and filtered list.

`insert` writes on the caller's own connection and never commits — the
caller commits (or rolls back) it together with the action it audits, so a
failed action leaves no audit row (FA-F0.4).
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC
from typing import cast

from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import Role

_COLUMNS = (
    "id, occurred_at, actor_user_id, actor_role, action, entity_type, entity_id, correlation_id"
)


@dataclass(frozen=True)
class AuditEntryRecord:
    """A row from `audit_log`."""

    id: int
    occurred_at: str
    actor_user_id: int
    actor_role: Role
    action: str
    entity_type: str
    entity_id: int
    correlation_id: str


@dataclass(frozen=True)
class AuditEntryPage:
    """A page of `AuditEntryRecord`s plus pagination metadata."""

    items: list[AuditEntryRecord]
    total: int
    limit: int
    offset: int


def insert(
    conn: sqlite3.Connection,
    clock: Clock,
    *,
    actor: AuthPrincipal,
    action: str,
    entity_type: str,
    entity_id: int,
    correlation_id: str,
) -> None:
    """Append one row on `conn`'s current transaction. Does not commit."""
    occurred_at = clock.now().astimezone(UTC).isoformat()
    conn.execute(
        "INSERT INTO audit_log (occurred_at, actor_user_id, actor_role, action,"
        " entity_type, entity_id, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (occurred_at, actor.user_id, actor.role, action, entity_type, entity_id, correlation_id),
    )


def list_entries(
    conn: sqlite3.Connection,
    *,
    entity_type: str | None = None,
    entity_id: int | None = None,
    action: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> AuditEntryPage:
    """Filtered page, ascending by `id`. `total` ignores `limit`/`offset`."""
    where, params = _filters(entity_type, entity_id, action)
    total = cast(int, conn.execute(f"SELECT COUNT(*) FROM audit_log{where}", params).fetchone()[0])
    rows = conn.execute(
        f"SELECT {_COLUMNS} FROM audit_log{where} ORDER BY id ASC LIMIT ? OFFSET ?",
        (*params, limit, offset),
    ).fetchall()
    return AuditEntryPage(
        items=[_to_record(row) for row in rows], total=total, limit=limit, offset=offset
    )


def _filters(
    entity_type: str | None, entity_id: int | None, action: str | None
) -> tuple[str, list[object]]:
    clauses: list[str] = []
    params: list[object] = []
    if entity_type is not None:
        clauses.append("entity_type = ?")
        params.append(entity_type)
    if entity_id is not None:
        clauses.append("entity_id = ?")
        params.append(entity_id)
    if action is not None:
        clauses.append("action = ?")
        params.append(action)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


def _to_record(row: tuple[int, str, int, str, str, str, int, str]) -> AuditEntryRecord:
    rid, occurred_at, actor_user_id, actor_role, action, entity_type, entity_id, correlation_id = (
        row
    )
    return AuditEntryRecord(
        id=rid,
        occurred_at=occurred_at,
        actor_user_id=actor_user_id,
        actor_role=cast(Role, actor_role),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        correlation_id=correlation_id,
    )
