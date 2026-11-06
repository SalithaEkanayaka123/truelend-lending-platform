"""Resolutions repository (E3-S5): the insert-only `resolutions` table, one
row per application (manual review or override). The migration's triggers
reject every `UPDATE` and `DELETE`.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import cast

from truelend.types.enums import ResolutionKind, ResolutionOutcome

_COLUMNS = "kind, outcome, reason_code, comment, resolved_by, resolved_at"


@dataclass(frozen=True)
class ResolutionRecord:
    kind: ResolutionKind
    outcome: ResolutionOutcome
    reason_code: str | None
    comment: str
    resolved_by: int
    resolved_at: str


def insert(
    conn: sqlite3.Connection,
    *,
    application_id: int,
    kind: ResolutionKind,
    outcome: ResolutionOutcome,
    reason_code: str | None,
    comment: str,
    resolved_by: int,
    resolved_at: str,
) -> None:
    """Insert the one resolution row. Caller commits with the status change."""
    conn.execute(
        "INSERT INTO resolutions (application_id, kind, outcome, reason_code, comment,"
        " resolved_by, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (application_id, kind, outcome, reason_code, comment, resolved_by, resolved_at),
    )


def get_by_application(conn: sqlite3.Connection, application_id: int) -> ResolutionRecord | None:
    row = conn.execute(
        f"SELECT {_COLUMNS} FROM resolutions WHERE application_id = ?", (application_id,)
    ).fetchone()
    if row is None:
        return None
    kind, outcome, reason_code, comment, resolved_by, resolved_at = row
    return ResolutionRecord(
        kind=cast(ResolutionKind, kind),
        outcome=cast(ResolutionOutcome, outcome),
        reason_code=reason_code,
        comment=comment,
        resolved_by=resolved_by,
        resolved_at=resolved_at,
    )
