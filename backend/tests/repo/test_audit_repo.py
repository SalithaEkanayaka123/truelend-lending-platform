"""E1-S2: `audit_repo.insert`/`list_entries` at the repository seam
(VM-006, VM-008 exercised below the API)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from truelend.config.db import run_migrations
from truelend.repository import audit_repo
from truelend.types.enums import Role

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


@dataclass(frozen=True)
class _Principal:
    user_id: int
    role: Role
    email: str


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _connect(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "repo.db")
    run_migrations(conn, MIGRATIONS_DIR)
    return conn


def _insert(conn: sqlite3.Connection, entity_id: int, action: str = "REVIEW_APPROVED") -> None:
    actor = _Principal(user_id=3, role="UNDERWRITER", email="underwriter@example.test")
    audit_repo.insert(
        conn,
        _FixedClock(),
        actor=actor,
        action=action,
        entity_type="application",
        entity_id=entity_id,
        correlation_id="cid-00000001",
    )


def test_e1_s2_ac1_insert_writes_fields_with_utc_occurred_at(tmp_path: Path) -> None:
    conn = _connect(tmp_path)
    _insert(conn, entity_id=7)
    conn.commit()
    row = conn.execute(
        "SELECT actor_user_id, actor_role, action, entity_type, entity_id, correlation_id,"
        " occurred_at FROM audit_log"
    ).fetchone()
    assert row[:6] == (3, "UNDERWRITER", "REVIEW_APPROVED", "application", 7, "cid-00000001")
    assert row[6] == "2026-01-01T12:00:00+00:00"


def test_e1_s2_insert_does_not_commit(tmp_path: Path) -> None:
    conn = _connect(tmp_path)
    _insert(conn, entity_id=7)
    conn.rollback()
    assert conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0] == 0


def test_e1_s2_ac3_list_entries_filters_and_orders_ascending(tmp_path: Path) -> None:
    conn = _connect(tmp_path)
    for entity_id in (7, 7, 8, 7):
        _insert(conn, entity_id=entity_id)
    conn.commit()
    page = audit_repo.list_entries(conn, entity_type="application", entity_id=7)
    assert page.total == 3
    ids = [e.id for e in page.items]
    assert ids == sorted(ids)
    assert all(e.entity_id == 7 for e in page.items)


def test_e1_s2_list_entries_filters_by_action(tmp_path: Path) -> None:
    conn = _connect(tmp_path)
    _insert(conn, entity_id=10, action="REVIEW_APPROVED")
    _insert(conn, entity_id=10, action="REVIEW_REJECTED")
    conn.commit()
    page = audit_repo.list_entries(conn, action="REVIEW_REJECTED")
    assert page.total == 1
    assert page.items[0].action == "REVIEW_REJECTED"


def test_e1_s2_list_entries_respects_limit_and_offset(tmp_path: Path) -> None:
    conn = _connect(tmp_path)
    for _ in range(5):
        _insert(conn, entity_id=7)
    conn.commit()
    page = audit_repo.list_entries(conn, limit=2, offset=1)
    assert page.total == 5
    assert len(page.items) == 2
    assert page.limit == 2
    assert page.offset == 1
