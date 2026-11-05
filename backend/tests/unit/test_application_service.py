"""Unit tests for `application_service.apply()` range validation (E2-S2,
VM-027 unit-layer check). Drives `_validate_range` indirectly through
`apply()` against a seeded PERSONAL policy (tenure 12-60 months, amount
50000.00-1500000.00 at v1)."""

from __future__ import annotations

import sqlite3
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from truelend.config.db import run_migrations
from truelend.service import application_service, policy_service
from truelend.service.application_service import ApplyRequest
from truelend.types.contracts import CreditFlags
from truelend.types.errors import AmountOutOfRangeError, TenureOutOfRangeError

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_REAL_POLICY_FILE = Path(__file__).resolve().parents[2] / "policies" / "policy_v0001.json"

_BASE_REQUEST = ApplyRequest(
    applicant_user_id=1,
    product_type="PERSONAL",
    requested_amount=Decimal("200000.00"),
    tenure_months=24,
    age_years=30,
    monthly_income=Decimal("60000.00"),
    credit_flags=CreditFlags(prior_default=False, missed_payment_12m=False, thin_file=False),
    pan="ABCDE1234F",
    aadhaar="123456789012",
)


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _request(**overrides: Any) -> ApplyRequest:
    return replace(_BASE_REQUEST, **overrides)


def _conn(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "svc.db")
    run_migrations(conn, _MIGRATIONS_DIR)
    conn.execute(
        "INSERT INTO users (id, email, role, password_hash) VALUES (1, 'a@x.test', 'CUSTOMER', 'h')"
    )
    conn.commit()
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    (policies_dir / "policy_v0001.json").write_text(
        _REAL_POLICY_FILE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    return conn


def test_vm027_tenure_below_min_raises_tenure_out_of_range(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    with pytest.raises(TenureOutOfRangeError) as exc:
        application_service.apply(conn, _FixedClock(), _request(tenure_months=11))
    assert exc.value.code == "TENURE_OUT_OF_RANGE"


def test_vm027_tenure_above_max_raises_tenure_out_of_range(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    with pytest.raises(TenureOutOfRangeError) as exc:
        application_service.apply(conn, _FixedClock(), _request(tenure_months=61))
    assert exc.value.code == "TENURE_OUT_OF_RANGE"


def test_vm027_amount_below_min_raises_amount_out_of_range(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    with pytest.raises(AmountOutOfRangeError) as exc:
        application_service.apply(
            conn, _FixedClock(), _request(requested_amount=Decimal("49999.99"))
        )
    assert exc.value.code == "AMOUNT_OUT_OF_RANGE"


def test_vm027_amount_above_max_raises_amount_out_of_range(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    with pytest.raises(AmountOutOfRangeError) as exc:
        application_service.apply(
            conn, _FixedClock(), _request(requested_amount=Decimal("1500000.01"))
        )
    assert exc.value.code == "AMOUNT_OUT_OF_RANGE"


def test_vm027_in_range_request_succeeds(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    view = application_service.apply(conn, _FixedClock(), _request())
    assert view.status == "DRAFT"
    assert view.requested_amount == Decimal("200000.00")
    assert view.tenure_months == 24
