"""E2-S2: `application_documents` checklist repository (insertion order)."""

from __future__ import annotations

import sqlite3
from decimal import Decimal
from pathlib import Path

from truelend.config.db import run_migrations
from truelend.repository import applications_repo, documents_repo
from truelend.types.contracts import CreditFlags

_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
_CREATED_AT = "2026-01-01T00:00:00+00:00"


def _conn(tmp_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(tmp_path / "docs.db")
    run_migrations(conn, _MIGRATIONS_DIR)
    conn.execute(
        "INSERT INTO users (id, email, role, password_hash) VALUES (1, 'a@x.test', 'CUSTOMER', 'h')"
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
        created_at=_CREATED_AT,
    )
    conn.commit()
    return app_id


def test_insert_checklist_then_get_preserves_insertion_order(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    app_id = _application_id(conn)
    documents_repo.insert_checklist(conn, app_id, ["ID_PROOF", "ADDRESS_PROOF", "SALARY_SLIP"])
    conn.commit()
    checklist = documents_repo.get_checklist(conn, app_id)
    assert [item.type for item in checklist] == ["ID_PROOF", "ADDRESS_PROOF", "SALARY_SLIP"]
    assert all(item.status == "MISSING" for item in checklist)


def test_get_checklist_returns_empty_list_for_application_with_no_checklist(
    tmp_path: Path,
) -> None:
    conn = _conn(tmp_path)
    app_id = _application_id(conn)
    assert documents_repo.get_checklist(conn, app_id) == []


def test_mark_uploaded_sets_status_filename_and_uploaded_at(tmp_path: Path) -> None:
    conn = _conn(tmp_path)
    app_id = _application_id(conn)
    documents_repo.insert_checklist(conn, app_id, ["ID_PROOF", "SALARY_SLIP"])
    conn.commit()
    documents_repo.mark_uploaded(conn, app_id, "ID_PROOF", "id_front.png", _CREATED_AT)
    conn.commit()
    checklist = documents_repo.get_checklist(conn, app_id)
    id_proof = next(item for item in checklist if item.type == "ID_PROOF")
    assert id_proof.status == "UPLOADED"
    assert id_proof.filename == "id_front.png"
    salary_slip = next(item for item in checklist if item.type == "SALARY_SLIP")
    assert salary_slip.status == "MISSING"


def test_mark_uploaded_on_rejected_document_resets_to_uploaded_and_clears_reason(
    tmp_path: Path,
) -> None:
    conn = _conn(tmp_path)
    app_id = _application_id(conn)
    documents_repo.insert_checklist(conn, app_id, ["ID_PROOF"])
    conn.execute(
        "UPDATE application_documents SET status = 'REJECTED', reason = 'blurry'"
        " WHERE application_id = ? AND type = 'ID_PROOF'",
        (app_id,),
    )
    conn.commit()
    documents_repo.mark_uploaded(conn, app_id, "ID_PROOF", "id_front_v2.png", _CREATED_AT)
    conn.commit()
    item = documents_repo.get_checklist(conn, app_id)[0]
    assert item.status == "UPLOADED"
    assert item.filename == "id_front_v2.png"
    assert item.reason is None
