"""E2-S1/E4-S1: policy_service -- idempotent seeding, startup checksum
verification (VM-024), the active-version catalog with Decimal money
(VM-020..VM-022), and create/approve policy versions (VM-065..VM-070):
confinement + re-verify-on-every-read, and validation before any file is
written."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from truelend.config.db import run_migrations
from truelend.service import policy_service
from truelend.types.enums import Role
from truelend.types.errors import (
    ConflictError,
    NotFoundError,
    PolicyChecksumMismatchError,
    PolicyFieldValidationError,
    PolicyPathTraversalError,
)

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_REAL_POLICY_FILE = Path(__file__).resolve().parents[2] / "policies" / "policy_v0001.json"


@dataclass
class _ActorStub:
    """A mutable `AuthPrincipal` (types.contracts) for test actors. Unlike
    `service.auth_service.Principal` (frozen), this satisfies the protocol's
    structural check for settable attributes."""

    user_id: int
    email: str
    role: Role


_EDITOR = _ActorStub(user_id=2, email="editor@x.test", role="POLICY_EDITOR")
_ADMIN = _ActorStub(user_id=1, email="admin@x.test", role="ADMIN")


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def _conn(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "svc.db")
    run_migrations(conn, _MIGRATIONS_DIR)
    conn.execute(
        "INSERT INTO users (id, email, role, password_hash) VALUES (1, 'a@x.test', 'ADMIN', 'h')"
    )
    conn.execute(
        "INSERT INTO users (id, email, role, password_hash)"
        " VALUES (2, 'e@x.test', 'POLICY_EDITOR', 'h')"
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


def _seeded(tmp_path: Path) -> tuple[sqlite3.Connection, Path]:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    return conn, policies_dir


def test_e2_s1_seed_is_idempotent_and_recorded_as_approved(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    rows = conn.execute("SELECT version, status, approved_by FROM policy_versions").fetchall()
    assert rows == [(1, "APPROVED", 1)]


def test_e2_s1_ac1_catalog_has_exactly_3_products_at_version_1(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    catalog = policy_service.get_active_catalog(conn, policies_dir)
    assert len(catalog) == 3
    assert {rule.product_type for rule in catalog} == {"PERSONAL", "VEHICLE", "EDUCATION"}
    assert all(rule.policy_version == 1 for rule in catalog)


def test_e2_s1_ac2_catalog_uses_decimal_money_matching_thresholds(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    catalog = policy_service.get_active_catalog(conn, policies_dir)
    by_type = {rule.product_type: rule for rule in catalog}
    assert by_type["PERSONAL"].min_income == Decimal("25000.00")
    assert by_type["VEHICLE"].min_income == Decimal("30000.00")
    assert by_type["EDUCATION"].min_income == Decimal("20000.00")
    assert isinstance(by_type["PERSONAL"].min_income, Decimal)


def test_e2_s1_ac3_catalog_required_documents_counts(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    catalog = policy_service.get_active_catalog(conn, policies_dir)
    by_type = {rule.product_type: rule for rule in catalog}
    assert len(by_type["PERSONAL"].required_documents) == 3
    assert len(by_type["VEHICLE"].required_documents) == 4
    assert len(by_type["EDUCATION"].required_documents) == 4


def test_e2_s1_ac5_verify_raises_on_tampered_file(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    (policies_dir / "policy_v0001.json").write_text(
        json.dumps({"tampered": True}), encoding="utf-8"
    )
    with pytest.raises(PolicyChecksumMismatchError) as exc:
        policy_service.verify_policy_checksums(conn, policies_dir)
    assert exc.value.code == "POLICY_CHECKSUM_MISMATCH"


def test_e2_s1_ac5_verify_passes_when_file_untouched(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    policy_service.verify_policy_checksums(conn, policies_dir)  # does not raise


def test_e4_s1_create_policy_copies_predecessor_and_applies_changes(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    original_hash = hashlib.sha256((policies_dir / "policy_v0001.json").read_bytes()).hexdigest()
    record = policy_service.create_policy(
        conn,
        policies_dir,
        _FixedClock(),
        base_version=1,
        changes={"PERSONAL": {"min_income": "30000.00"}},
        actor=_EDITOR,
        correlation_id="corr-1",
    )
    assert record.version == 2
    assert record.status == "DRAFT"
    assert record.created_by == 2
    new_file = policies_dir / "policy_v0002.json"
    assert new_file.is_file()
    new_content = json.loads(new_file.read_text(encoding="utf-8"))
    assert new_content["products"]["PERSONAL"]["min_income"] == "30000.00"
    assert new_content["products"]["EDUCATION"]["min_income"] == "20000.00"
    assert (
        hashlib.sha256((policies_dir / "policy_v0001.json").read_bytes()).hexdigest()
        == original_hash
    )


def test_e4_s1_create_policy_unknown_base_version_raises_not_found(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    with pytest.raises(NotFoundError):
        policy_service.create_policy(
            conn,
            policies_dir,
            _FixedClock(),
            base_version=99,
            changes={},
            actor=_EDITOR,
            correlation_id="corr-1",
        )


def test_e4_s1_create_policy_invalid_score_band_raises_and_writes_no_file(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    with pytest.raises(PolicyFieldValidationError) as exc:
        policy_service.create_policy(
            conn,
            policies_dir,
            _FixedClock(),
            base_version=1,
            changes={"PERSONAL": {"auto_reject_below_score": 750, "auto_approve_min_score": 700}},
            actor=_EDITOR,
            correlation_id="corr-1",
        )
    assert "auto_reject_below_score" in exc.value.message
    assert not (policies_dir / "policy_v0002.json").exists()


def test_e4_s1_create_policy_negative_money_field_raises_and_writes_no_file(
    tmp_path: Path,
) -> None:
    conn, policies_dir = _seeded(tmp_path)
    with pytest.raises(PolicyFieldValidationError) as exc:
        policy_service.create_policy(
            conn,
            policies_dir,
            _FixedClock(),
            base_version=1,
            changes={"PERSONAL": {"min_income": "-1"}},
            actor=_EDITOR,
            correlation_id="corr-1",
        )
    assert "min_income" in exc.value.message
    assert not (policies_dir / "policy_v0002.json").exists()


def test_e4_s1_approve_policy_transitions_draft_to_approved_with_audit(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    created = policy_service.create_policy(
        conn,
        policies_dir,
        _FixedClock(),
        base_version=1,
        changes={"PERSONAL": {"min_income": "30000.00"}},
        actor=_EDITOR,
        correlation_id="corr-1",
    )
    approved = policy_service.approve_policy(
        conn, _FixedClock(), version=created.version, actor=_ADMIN, correlation_id="corr-2"
    )
    assert approved.status == "APPROVED"
    assert approved.approved_by == 1
    from truelend.repository import audit_repo

    page = audit_repo.list_entries(
        conn, entity_type="policy_version", entity_id=created.version, action="POLICY_APPROVED"
    )
    assert page.total == 1


def test_e4_s1_approve_policy_already_approved_raises_conflict(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    created = policy_service.create_policy(
        conn,
        policies_dir,
        _FixedClock(),
        base_version=1,
        changes={"PERSONAL": {"min_income": "30000.00"}},
        actor=_EDITOR,
        correlation_id="corr-1",
    )
    policy_service.approve_policy(
        conn, _FixedClock(), version=created.version, actor=_ADMIN, correlation_id="corr-2"
    )
    with pytest.raises(ConflictError):
        policy_service.approve_policy(
            conn, _FixedClock(), version=created.version, actor=_ADMIN, correlation_id="corr-3"
        )


def test_e4_s1_approve_policy_missing_version_raises_not_found(tmp_path: Path) -> None:
    conn, _policies = _seeded(tmp_path)
    with pytest.raises(NotFoundError):
        policy_service.approve_policy(
            conn, _FixedClock(), version=99, actor=_ADMIN, correlation_id="corr-1"
        )


def test_e4_s1_get_active_catalog_tampered_file_raises_on_every_read(tmp_path: Path) -> None:
    conn, policies_dir = _seeded(tmp_path)
    policy_service.get_active_catalog(conn, policies_dir)  # passes while untouched
    (policies_dir / "policy_v0001.json").write_text(
        json.dumps({"tampered": True}), encoding="utf-8"
    )
    with pytest.raises(PolicyChecksumMismatchError):
        policy_service.get_active_catalog(conn, policies_dir)
    with pytest.raises(PolicyChecksumMismatchError):
        policy_service.get_active_catalog(conn, policies_dir)  # re-verified, not cached stale


def test_e4_s1_get_active_catalog_traversal_file_path_raises(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    outside = tmp_path / "outside.json"
    outside.write_text(json.dumps({"products": {}}), encoding="utf-8")
    sha = hashlib.sha256(outside.read_bytes()).hexdigest()
    conn.execute(
        "INSERT INTO policy_versions (version, status, file_path, sha256, base_version,"
        " created_by, created_at, approved_by, approved_at)"
        " VALUES (1, 'APPROVED', ?, ?, NULL, 1, '2026-01-01T00:00:00+00:00', 1,"
        " '2026-01-01T00:00:00+00:00')",
        (str(policies_dir / ".." / "outside.json"), sha),
    )
    conn.commit()
    with pytest.raises(PolicyPathTraversalError):
        policy_service.get_active_catalog(conn, policies_dir)


def _rig_toctou_swap(
    monkeypatch: pytest.MonkeyPatch, target: Path, genuine_bytes: bytes, tampered_text: str
) -> dict[str, int]:
    """Make reads of `target` return genuine bytes but tampered text, and
    count how many times its content is actually fetched from disk."""
    calls = {"read_bytes": 0, "read_text": 0}
    real_read_bytes = Path.read_bytes
    real_read_text = Path.read_text

    def fake_read_bytes(self: Path) -> bytes:
        if self.resolve() == target:
            calls["read_bytes"] += 1
            return genuine_bytes
        return real_read_bytes(self)

    def fake_read_text(self: Path, encoding: str | None = None, errors: str | None = None) -> str:
        if self.resolve() == target:
            calls["read_text"] += 1
            return tampered_text
        return real_read_text(self, encoding, errors)

    monkeypatch.setattr(Path, "read_bytes", fake_read_bytes)
    monkeypatch.setattr(Path, "read_text", fake_read_text)
    return calls


def test_e4_s1_read_verified_json_parses_the_bytes_it_hashed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """TOCTOU guard: the catalog must come from the exact bytes whose hash was
    checked, and the file's content must be fetched from disk exactly once
    per read -- not hashed from one read and parsed from a second, later
    read that a swap could have tampered with."""
    conn, policies_dir = _seeded(tmp_path)
    target = (policies_dir / "policy_v0001.json").resolve()
    genuine_bytes = target.read_bytes()
    tampered_text = json.dumps({"products": {}})
    calls = _rig_toctou_swap(monkeypatch, target, genuine_bytes, tampered_text)

    catalog = policy_service.get_active_catalog(conn, policies_dir)

    assert len(catalog) == 3, "must parse the verified bytes, not a later tampered read_text"
    assert calls["read_bytes"] + calls["read_text"] == 1, "file content fetched more than once"


def _rig_resolve_escape(monkeypatch: pytest.MonkeyPatch, target: Path, outside: Path) -> None:
    """Make `target.resolve()` return `outside` -- the same escape a symlink
    pointing from `target` to `outside` would produce, without a real one."""
    real_resolve = Path.resolve

    def fake_resolve(self: Path, strict: bool = False) -> Path:
        if self == target:
            return outside
        return real_resolve(self, strict)

    monkeypatch.setattr(Path, "resolve", fake_resolve)


def test_e4_s1_get_active_catalog_symlink_traversal_raises(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No real symlink needed: `Path.resolve` is stubbed for the recorded
    file so it resolves outside `policies_dir`, the same escape a symlink
    would produce."""
    conn = _conn(tmp_path)
    policies_dir = _policies_dir(tmp_path)
    target = policies_dir / "policy_v0001.json"
    sha = hashlib.sha256(target.read_bytes()).hexdigest()
    conn.execute(
        "INSERT INTO policy_versions (version, status, file_path, sha256, base_version,"
        " created_by, created_at, approved_by, approved_at)"
        " VALUES (1, 'APPROVED', ?, ?, NULL, 1, '2026-01-01T00:00:00+00:00', 1,"
        " '2026-01-01T00:00:00+00:00')",
        (str(target), sha),
    )
    conn.commit()

    # Control: unpatched, `target` resolves inside `policies_dir` and the
    # read succeeds -- proves the raise below comes from the patch, not a
    # pre-existing failure.
    assert len(policy_service.get_active_catalog(conn, policies_dir)) == 3

    _rig_resolve_escape(monkeypatch, target, tmp_path / "outside-escape-target.json")

    with pytest.raises(PolicyPathTraversalError):
        policy_service.get_active_catalog(conn, policies_dir)
    with pytest.raises(PolicyPathTraversalError):
        policy_service.verify_policy_checksums(conn, policies_dir)
