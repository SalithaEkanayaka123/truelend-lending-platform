"""Decisions repository (E3-S3): the insert-only `decisions` table, one row
per application (unique on `application_id`). The migration's triggers
reject every `UPDATE` and `DELETE`, so this module only ever inserts and
reads.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import cast

from truelend.types.enums import DecisionType

_COLUMNS = "id, application_id, decision, score, reason_codes, policy_version, decided_at"


@dataclass(frozen=True)
class DecisionRecord:
    id: int
    application_id: int
    decision: DecisionType
    score: int
    reason_codes: list[str]
    policy_version: int
    decided_at: str


def insert(
    conn: sqlite3.Connection,
    *,
    application_id: int,
    decision: DecisionType,
    score: int,
    reason_codes: list[str],
    policy_version: int,
    decided_at: str,
) -> int:
    """Insert the one decision row for `application_id`. Caller commits
    together with the application status update (single-owner transaction)."""
    cursor = conn.execute(
        "INSERT INTO decisions (application_id, decision, score, reason_codes,"
        " policy_version, decided_at) VALUES (?, ?, ?, ?, ?, ?)",
        (application_id, decision, score, json.dumps(reason_codes), policy_version, decided_at),
    )
    return cast(int, cursor.lastrowid)


def get_by_application(conn: sqlite3.Connection, application_id: int) -> DecisionRecord | None:
    """The decision row for `application_id`, or `None` if not yet decided."""
    row = conn.execute(
        f"SELECT {_COLUMNS} FROM decisions WHERE application_id = ?", (application_id,)
    ).fetchone()
    return _to_record(row) if row is not None else None


def _to_record(row: tuple[int, int, str, int, str, int, str]) -> DecisionRecord:
    rid, application_id, decision, score, reason_codes_json, policy_version, decided_at = row
    return DecisionRecord(
        id=rid,
        application_id=application_id,
        decision=cast(DecisionType, decision),
        score=score,
        reason_codes=json.loads(reason_codes_json),
        policy_version=policy_version,
        decided_at=decided_at,
    )
