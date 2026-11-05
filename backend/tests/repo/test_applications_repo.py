"""E2-S2: `applications` repository (insert/read, Decimal round-trip)."""

from __future__ import annotations

import sqlite3
from decimal import Decimal
from pathlib import Path

from truelend.config.db import run_migrations
from truelend.repository import applications_repo
from truelend.types.contracts import CreditFlags

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_CREATED_AT = "2026-01-01T00:00:00+00:00"


def _conn(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "apps.db")
    run_migrations(conn, _MIGRATIONS_DIR)
    conn.execute(
        "INSERT INTO users (id, email, role, password_hash) VALUES (1, 'a@x.test', 'CUSTOMER', 'h')"
    )
    conn.commit()
    return conn


def _flags() -> CreditFlags:
    return CreditFlags(prior_default=False, missed_payment_12m=True, thin_file=False)


def test_insert_then_get_round_trips_decimal_money_and_flags(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    app_id = applications_repo.insert_application(
        conn,
        applicant_user_id=1,
        product_type="PERSONAL",
        requested_amount=Decimal("200000.00"),
        tenure_months=24,
        age_years=30,
        monthly_income=Decimal("60000.00"),
        credit_flags=_flags(),
        pan="ABCDE1234F",
        aadhaar="123456789012",
        created_at=_CREATED_AT,
    )
    conn.commit()
    record = applications_repo.get_by_id(conn, app_id)
    assert record is not None
    assert record.requested_amount == Decimal("200000.00")
    assert record.monthly_income == Decimal("60000.00")
    assert record.credit_flags == _flags()
    assert record.status == "DRAFT"
    assert record.pan == "ABCDE1234F"
    assert record.aadhaar == "123456789012"


def test_get_by_id_returns_none_for_missing_id(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    assert applications_repo.get_by_id(conn, 999) is None
