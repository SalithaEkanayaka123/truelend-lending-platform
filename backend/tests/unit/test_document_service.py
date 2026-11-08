"""Unit tests for `document_service` (E2-S3, VM-030..VM-034 unit-layer
checks): upload against the real seeded PERSONAL policy and submit with
pinned policy version."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from truelend.config.db import run_migrations
from truelend.service import application_service, document_service, policy_service
from truelend.service.application_service import ApplyRequest
from truelend.types.contracts import CreditFlags
from truelend.types.enums import Role
from truelend.types.errors import (
    AlreadySubmittedError,
    DocumentTypeNotRequiredError,
    MissingDocumentsError,
    NotFoundError,
)

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_REAL_POLICY_FILE = Path(__file__).resolve().parents[2] / "policies" / "policy_v0001.json"

_OWNER_ID = 1
_OTHER_ID = 2


class _FixedClock:
    def now(self) -> datetime:
        return datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


class _Principal:
    def __init__(self, user_id: int, role: Role = "CUSTOMER") -> None:
        self.user_id = user_id
        self.role = role
        self.email = f"user{user_id}@example.test"


def _conn(tmp_path: Path) -> tuple[sqlite3.Connection, Path]:
    conn = sqlite3.connect(tmp_path / "svc.db")
    run_migrations(conn, _MIGRATIONS_DIR)
    for user_id in (_OWNER_ID, _OTHER_ID):
        conn.execute(
            "INSERT INTO users (id, email, role, password_hash)"
            " VALUES (?, ?, 'CUSTOMER', 'h')",
            (user_id, f"user{user_id}@x.test"),
        )
    conn.commit()
    policies_dir = tmp_path / "policies"
    policies_dir.mkdir()
    (policies_dir / "policy_v0001.json").write_text(
        _REAL_POLICY_FILE.read_text(encoding="utf-8"), encoding="utf-8"
    )
    policy_service.seed_policy_version_one(conn, policies_dir, clock=_FixedClock(), created_by=1)
    return conn, policies_dir


def _create_application(conn: sqlite3.Connection, policies_dir: Path) -> int:
    request = ApplyRequest(
        applicant_user_id=_OWNER_ID,
        product_type="PERSONAL",
        requested_amount=Decimal("200000.00"),
        tenure_months=24,
        age_years=30,
        monthly_income=Decimal("60000.00"),
        credit_flags=CreditFlags(prior_default=False, missed_payment_12m=False, thin_file=False),
        pan="ABCDE1234F",
        aadhaar="123456789012",
    )
    view = application_service.apply(conn, _FixedClock(), request, policies_dir=policies_dir)
    return view.id


def test_upload_document_sets_checklist_item_to_uploaded(tmp_path: Path) -> None:
    conn, policies_dir = _conn(tmp_path)
    app_id = _create_application(conn, policies_dir)
    view = document_service.upload_document(
        conn,
        _FixedClock(),
        app_id,
        document_type="ID_PROOF",
        filename="id_front.png",
        principal=_Principal(_OWNER_ID),
    )
    doc = next(item for item in view.required_documents if item.type == "ID_PROOF")
    assert doc.status == "UPLOADED"
    assert doc.filename == "id_front.png"


def test_upload_document_by_non_owner_raises_not_found(tmp_path: Path) -> None:
    conn, policies_dir = _conn(tmp_path)
    app_id = _create_application(conn, policies_dir)
    with pytest.raises(NotFoundError):
        document_service.upload_document(
            conn,
            _FixedClock(),
            app_id,
            document_type="ID_PROOF",
            filename="id_front.png",
            principal=_Principal(_OTHER_ID),
        )


def test_upload_document_not_on_checklist_raises_document_type_not_required(
    tmp_path: Path,
) -> None:
    conn, policies_dir = _conn(tmp_path)
    app_id = _create_application(conn, policies_dir)
    with pytest.raises(DocumentTypeNotRequiredError) as exc:
        document_service.upload_document(
            conn,
            _FixedClock(),
            app_id,
            document_type="VEHICLE_QUOTATION",
            filename="quote.png",
            principal=_Principal(_OWNER_ID),
        )
    assert exc.value.code == "DOCUMENT_TYPE_NOT_REQUIRED"


def _upload_all(conn: sqlite3.Connection, app_id: int) -> None:
    for doc_type, filename in (
        ("ID_PROOF", "id.png"),
        ("ADDRESS_PROOF", "addr.png"),
        ("SALARY_SLIP", "slip.png"),
    ):
        document_service.upload_document(
            conn,
            _FixedClock(),
            app_id,
            document_type=doc_type,  # type: ignore[arg-type]
            filename=filename,
            principal=_Principal(_OWNER_ID),
        )


def _submit_and_verify_id_proof(conn: sqlite3.Connection, policies_dir: Path, app_id: int) -> None:
    _upload_all(conn, app_id)
    document_service.submit_application(
        conn, _FixedClock(), app_id, principal=_Principal(_OWNER_ID), policies_dir=policies_dir
    )
    conn.execute(
        "UPDATE application_documents SET status = 'VERIFIED'"
        " WHERE application_id = ? AND type = 'ID_PROOF'",
        (app_id,),
    )
    conn.commit()


def test_e3_s1_ac5_reupload_after_submission_is_rejected_and_verified_stays_final(
    tmp_path: Path,
) -> None:
    """CR-001: a VERIFIED document can never return to UPLOADED."""
    conn, policies_dir = _conn(tmp_path)
    app_id = _create_application(conn, policies_dir)
    _submit_and_verify_id_proof(conn, policies_dir, app_id)
    with pytest.raises(AlreadySubmittedError):
        document_service.upload_document(
            conn,
            _FixedClock(),
            app_id,
            document_type="ID_PROOF",
            filename="swapped.png",
            principal=_Principal(_OWNER_ID),
        )
    row = conn.execute(
        "SELECT status, filename FROM application_documents"
        " WHERE application_id = ? AND type = 'ID_PROOF'",
        (app_id,),
    ).fetchone()
    assert row == ("VERIFIED", "id.png")


def test_submit_with_missing_document_raises_missing_documents(tmp_path: Path) -> None:
    conn, policies_dir = _conn(tmp_path)
    app_id = _create_application(conn, policies_dir)
    document_service.upload_document(
        conn,
        _FixedClock(),
        app_id,
        document_type="ID_PROOF",
        filename="id.png",
        principal=_Principal(_OWNER_ID),
    )
    with pytest.raises(MissingDocumentsError) as exc:
        document_service.submit_application(
            conn, _FixedClock(), app_id, principal=_Principal(_OWNER_ID), policies_dir=policies_dir
        )
    assert exc.value.missing == ["ADDRESS_PROOF", "SALARY_SLIP"]


def test_submit_pins_active_policy_version_and_sets_submitted_at(tmp_path: Path) -> None:
    conn, policies_dir = _conn(tmp_path)
    app_id = _create_application(conn, policies_dir)
    _upload_all(conn, app_id)
    view = document_service.submit_application(
        conn, _FixedClock(), app_id, principal=_Principal(_OWNER_ID), policies_dir=policies_dir
    )
    assert view.status == "SUBMITTED"
    assert view.policy_version == 1
    assert view.submitted_at is not None


def test_submit_twice_raises_already_submitted(tmp_path: Path) -> None:
    conn, policies_dir = _conn(tmp_path)
    app_id = _create_application(conn, policies_dir)
    _upload_all(conn, app_id)
    document_service.submit_application(
        conn, _FixedClock(), app_id, principal=_Principal(_OWNER_ID), policies_dir=policies_dir
    )
    with pytest.raises(AlreadySubmittedError):
        document_service.submit_application(
            conn, _FixedClock(), app_id, principal=_Principal(_OWNER_ID), policies_dir=policies_dir
        )
