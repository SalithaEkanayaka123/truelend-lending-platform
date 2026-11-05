"""E2-S1: `policy_versions` repository (insert/read, active version)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from truelend.config.db import run_migrations
from truelend.repository import policy_repo

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_CREATED_AT = "2026-01-01T00:00:00+00:00"


def _conn(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "policy.db")
    run_migrations(conn, _MIGRATIONS_DIR)
    conn.execute(
        "INSERT INTO users (id, email, role, password_hash) VALUES (1, 'a@x.test', 'ADMIN', 'h')"
    )
    conn.commit()
    return conn


def _insert(conn: sqlite3.Connection, version: int, file_path: str, sha256: str) -> None:
    policy_repo.insert_if_absent(
        conn,
        version=version,
        status="APPROVED",
        file_path=file_path,
        sha256=sha256,
        base_version=None,
        created_by=1,
        created_at=_CREATED_AT,
        approved_by=1,
        approved_at=_CREATED_AT,
    )


def test_e2_s1_insert_if_absent_is_idempotent(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    _insert(conn, 1, "p.json", "a" * 64)
    _insert(conn, 1, "other.json", "b" * 64)
    conn.commit()
    rows = policy_repo.list_versions(conn)
    assert len(rows) == 1
    assert rows[0].file_path == "p.json"
    assert rows[0].sha256 == "a" * 64


def test_e2_s1_get_active_version_is_highest_approved(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    _insert(conn, 1, "p1.json", "a" * 64)
    _insert(conn, 2, "p2.json", "b" * 64)
    conn.commit()
    active = policy_repo.get_active_version(conn)
    assert active is not None
    assert active.version == 2
    assert active.file_path == "p2.json"


def test_e2_s1_get_active_version_none_when_no_approved_rows(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    assert policy_repo.get_active_version(conn) is None


def test_e2_s1_delete_on_policy_versions_aborts(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    _insert(conn, 1, "p.json", "a" * 64)
    conn.commit()
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute("DELETE FROM policy_versions")
    assert len(policy_repo.list_versions(conn)) == 1


def test_e2_s1_update_other_than_draft_to_approved_aborts(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    _insert(conn, 1, "p.json", "a" * 64)
    conn.commit()
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute("UPDATE policy_versions SET file_path = 'tampered.json' WHERE version = 1")


# E4-S1 (VM-065..VM-070): insert_draft / next_version / approve.


def test_e4_s1_next_version_is_one_when_table_empty(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    assert policy_repo.next_version(conn) == 1


def test_e4_s1_next_version_is_highest_plus_one(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    _insert(conn, 1, "p1.json", "a" * 64)
    conn.commit()
    assert policy_repo.next_version(conn) == 2


def test_e4_s1_get_by_version_returns_none_when_missing(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    assert policy_repo.get_by_version(conn, 1) is None


def test_e4_s1_insert_draft_then_get_by_version_round_trips(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policy_repo.insert_draft(
        conn,
        version=2,
        file_path="p2.json",
        sha256="c" * 64,
        base_version=1,
        created_by=1,
        created_at=_CREATED_AT,
    )
    conn.commit()
    record = policy_repo.get_by_version(conn, 2)
    assert record is not None
    assert record.status == "DRAFT"
    assert record.base_version == 1
    assert record.approved_by is None
    assert record.approved_at is None


def test_e4_s1_approve_transitions_draft_to_approved(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policy_repo.insert_draft(
        conn,
        version=2,
        file_path="p2.json",
        sha256="c" * 64,
        base_version=1,
        created_by=1,
        created_at=_CREATED_AT,
    )
    conn.commit()
    rowcount = policy_repo.approve(conn, version=2, approved_by=1, approved_at=_CREATED_AT)
    conn.commit()
    assert rowcount == 1
    record = policy_repo.get_by_version(conn, 2)
    assert record is not None
    assert record.status == "APPROVED"
    assert record.approved_by == 1


def test_e4_s1_approve_is_noop_when_not_draft(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    _insert(conn, 1, "p1.json", "a" * 64)  # inserted as APPROVED
    conn.commit()
    rowcount = policy_repo.approve(conn, version=1, approved_by=1, approved_at=_CREATED_AT)
    assert rowcount == 0
