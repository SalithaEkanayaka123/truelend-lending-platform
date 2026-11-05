"""E2-S1: policy_service — idempotent seeding, startup checksum
verification (VM-024), and the active-version catalog with Decimal money
(VM-020..VM-022)."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from truelend.config.db import run_migrations
from truelend.service import policy_service
from truelend.types.errors import PolicyChecksumMismatchError

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_REAL_POLICY_FILE = Path(__file__).resolve().parents[2] / "policies" / "policy_v0001.json"


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _conn(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "svc.db")
    run_migrations(conn, _MIGRATIONS_DIR)
    conn.execute(
        "INSERT INTO users (id, email, role, password_hash) VALUES (1, 'a@x.test', 'ADMIN', 'h')"
    )
    conn.commit()
    return conn


def _policies_dir(tmp_path: Path) -> Path:
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    (policies_dir / "policy_v0001.json").write_text(
        _REAL_POLICY_FILE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    return policies_dir


def test_e2_s1_seed_is_idempotent_and_recorded_as_approved(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    rows = conn.execute("SELECT version, status, approved_by FROM policy_versions").fetchall()
    assert rows == [(1, "APPROVED", 1)]


def test_e2_s1_ac1_catalog_has_exactly_3_products_at_version_1(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    catalog = policy_service.get_active_catalog(conn)
    assert len(catalog) == 3
    assert {rule.product_type for rule in catalog} == {"PERSONAL", "VEHICLE", "EDUCATION"}
    assert all(rule.policy_version == 1 for rule in catalog)


def test_e2_s1_ac2_catalog_uses_decimal_money_matching_thresholds(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    by_type = {rule.product_type: rule for rule in policy_service.get_active_catalog(conn)}
    assert by_type["PERSONAL"].min_income == Decimal("25000.00")
    assert by_type["VEHICLE"].min_income == Decimal("30000.00")
    assert by_type["EDUCATION"].min_income == Decimal("20000.00")
    assert isinstance(by_type["PERSONAL"].min_income, Decimal)


def test_e2_s1_ac3_catalog_required_documents_counts(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    by_type = {rule.product_type: rule for rule in policy_service.get_active_catalog(conn)}
    assert len(by_type["PERSONAL"].required_documents) == 3
    assert len(by_type["VEHICLE"].required_documents) == 4
    assert len(by_type["EDUCATION"].required_documents) == 4


def test_e2_s1_ac5_verify_raises_on_tampered_file(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    (policies_dir / "policy_v0001.json").write_text(
        json.dumps({"tampered": True}), encoding="utf-8"
    )
    with pytest.raises(PolicyChecksumMismatchError) as exc:
        policy_service.verify_policy_checksums(conn)
    assert exc.value.code == "POLICY_CHECKSUM_MISMATCH"


def test_e2_s1_ac5_verify_passes_when_file_untouched(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    policy_service.verify_policy_checksums(conn)  # does not raise
