"""Policy version repository (E2-S1): the append-only `policy_versions`
table. The migration's triggers reject every `DELETE` and any `UPDATE`
other than the one `DRAFT`->`APPROVED` transition, so this module only
ever inserts and reads.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import cast

from truelend.types.enums import PolicyStatus

_COLUMNS = (
    "version, status, file_path, sha256, base_version, created_by,"
    " created_at, approved_by, approved_at"
)


@dataclass(frozen=True)
class PolicyVersionRecord:
    """A row from `policy_versions`."""

    version: int
    status: PolicyStatus
    file_path: str
    sha256: str
    base_version: int | None
    created_by: int
    created_at: str
    approved_by: int | None
    approved_at: str | None


def insert_if_absent(
    conn: sqlite3.Connection,
    *,
    version: int,
    status: PolicyStatus,
    file_path: str,
    sha256: str,
    base_version: int | None,
    created_by: int,
    created_at: str,
    approved_by: int | None,
    approved_at: str | None,
) -> None:
    """Insert one row only if `version` is not already present. Caller
    commits (idempotent seeding, E2-S1-AC5 precondition)."""
    conn.execute(
        f"INSERT OR IGNORE INTO policy_versions ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            version,
            status,
            file_path,
            sha256,
            base_version,
            created_by,
            created_at,
            approved_by,
            approved_at,
        ),
    )


def list_versions(conn: sqlite3.Connection) -> list[PolicyVersionRecord]:
    """All rows, ascending by version."""
    rows = conn.execute(
        f"SELECT {_COLUMNS} FROM policy_versions ORDER BY version ASC"
    ).fetchall()
    return [_to_record(row) for row in rows]


def get_active_version(conn: sqlite3.Connection) -> PolicyVersionRecord | None:
    """The highest-numbered `APPROVED` version, or `None` if none exists."""
    row = conn.execute(
        f"SELECT {_COLUMNS} FROM policy_versions"
        " WHERE status = 'APPROVED' ORDER BY version DESC LIMIT 1"
    ).fetchone()
    return _to_record(row) if row is not None else None


def _to_record(
    row: tuple[int, str, str, str, int | None, int, str, int | None, str | None],
) -> PolicyVersionRecord:
    (version, status, file_path, sha256, base_version, created_by, created_at, approved_by,
     approved_at) = row
    return PolicyVersionRecord(
        version=version,
        status=cast(PolicyStatus, status),
        file_path=file_path,
        sha256=sha256,
        base_version=base_version,
        created_by=created_by,
        created_at=created_at,
        approved_by=approved_by,
        approved_at=approved_at,
    )
