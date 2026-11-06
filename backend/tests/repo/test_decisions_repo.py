"""E3-S3: `decisions` repository -- insert-only, unique per application."""

from __future__ import annotations

import sqlite3
from decimal import Decimal
from pathlib import Path

import pytest

from truelend.config.db import run_migrations
from truelend.repository import applications_repo, decisions_repo
from truelend.types.contracts import CreditFlags

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_DECIDED_AT = "2026-01-02T00:00:00+00:00"


def _conn(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "decisions.db")
    conn.execute("PRAGMA foreign_keys = ON")
    run_migrations(conn, _MIGRATIONS_DIR)
    conn.execute(
        "INSERT INTO users (id, email, role, password_hash) VALUES (1, 'a@x.test', 'CUSTOMER', 'h')"
    )
    conn.execute(
        "INSERT INTO policy_versions (version, status, file_path, sha256, created_by, created_at)"
        " VALUES (1, 'APPROVED', 'p.json', 'hash', 1, ?)",
        (_DECIDED_AT,),
    )
    conn.commit()
    return conn


def _application_id(conn: sqlite3.Connection) -> int:
    app_id = applications_repo.insert_application(
        conn,
        applicant_user_id=1,
        product_type="PERSONAL",
        requested_amount=Decimal("200000.00"),
        tenure_months=24,
        age_years=30,
        monthly_income=Decimal("60000.00"),
        credit_flags=CreditFlags(prior_default=False, missed_payment_12m=False, thin_file=False),
        pan="ABCDE1234F",
        aadhaar="123456789012",
        created_at=_DECIDED_AT,
    )
    conn.commit()
    return app_id


def test_insert_then_get_round_trips_fields(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    app_id = _application_id(conn)
    decisions_repo.insert(
        conn,
        application_id=app_id,
        decision="AUTO_APPROVE",
        score=740,
        reason_codes=["SCORE_MEETS_AUTO_APPROVE"],
        policy_version=1,
        decided_at=_DECIDED_AT,
    )
    conn.commit()
    record = decisions_repo.get_by_application(conn, app_id)
    assert record is not None
    assert record.decision == "AUTO_APPROVE"
    assert record.score == 740
    assert record.reason_codes == ["SCORE_MEETS_AUTO_APPROVE"]
    assert record.policy_version == 1
    assert record.decided_at == _DECIDED_AT


def test_get_by_application_returns_none_when_undecided(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    app_id = _application_id(conn)
    assert decisions_repo.get_by_application(conn, app_id) is None


def test_application_id_is_unique(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    app_id = _application_id(conn)
    decisions_repo.insert(
        conn,
        application_id=app_id,
        decision="AUTO_REJECT",
        score=500,
        reason_codes=["SCORE_BELOW_MIN"],
        policy_version=1,
        decided_at=_DECIDED_AT,
    )
    conn.commit()
    with pytest.raises(sqlite3.IntegrityError):
        decisions_repo.insert(
            conn,
            application_id=app_id,
            decision="AUTO_APPROVE",
            score=740,
            reason_codes=["SCORE_MEETS_AUTO_APPROVE"],
            policy_version=1,
            decided_at=_DECIDED_AT,
        )


def test_update_and_delete_are_blocked_by_trigger(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    app_id = _application_id(conn)
    decisions_repo.insert(
        conn,
        application_id=app_id,
        decision="AUTO_APPROVE",
        score=740,
        reason_codes=["SCORE_MEETS_AUTO_APPROVE"],
        policy_version=1,
        decided_at=_DECIDED_AT,
    )
    conn.commit()
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("UPDATE decisions SET score = 1 WHERE application_id = ?", (app_id,))
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("DELETE FROM decisions WHERE application_id = ?", (app_id,))
