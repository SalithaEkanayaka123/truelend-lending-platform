"""Applications repository (E2-S2): insert the DRAFT row and read it back.

Money is stored as integer paise (`config.money`), never `REAL`. Raw
PAN/Aadhaar are stored here; masking happens only at the service layer, and
only the service/API layers decide whether a caller may see a row at all.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from decimal import Decimal
from typing import cast

from truelend.config.money import decimal_to_paise, paise_to_decimal
from truelend.types.contracts import CreditFlags
from truelend.types.enums import ApplicationStatus, ProductType

_COLUMNS = (
    "id, applicant_user_id, product_type, requested_amount_paise, tenure_months,"
    " age_years, monthly_income_paise, credit_flags, pan, aadhaar, status,"
    " policy_version, created_at, submitted_at"
)

_INSERT_SQL = (
    "INSERT INTO applications (applicant_user_id, product_type,"
    " requested_amount_paise, tenure_months, age_years, monthly_income_paise,"
    " credit_flags, pan, aadhaar, status, policy_version, created_at, submitted_at)"
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', NULL, ?, NULL)"
)

_Row = tuple[
    int, int, str, int, int, int, int, str, str, str, str, int | None, str, str | None
]


@dataclass(frozen=True)
class ApplicationRecord:
    """A row from `applications`, with money as `Decimal` and flags decoded."""

    id: int
    applicant_user_id: int
    product_type: ProductType
    requested_amount: Decimal
    tenure_months: int
    age_years: int
    monthly_income: Decimal
    credit_flags: CreditFlags
    pan: str
    aadhaar: str
    status: ApplicationStatus
    policy_version: int | None
    created_at: str
    submitted_at: str | None


def insert_application(
    conn: sqlite3.Connection,
    *,
    applicant_user_id: int,
    product_type: ProductType,
    requested_amount: Decimal,
    tenure_months: int,
    age_years: int,
    monthly_income: Decimal,
    credit_flags: CreditFlags,
    pan: str,
    aadhaar: str,
    created_at: str,
) -> int:
    """Insert one `DRAFT` application row. Caller commits together with
    the checklist insert (single-owner transaction, SG-8)."""
    params = (
        applicant_user_id,
        product_type,
        decimal_to_paise(requested_amount),
        tenure_months,
        age_years,
        decimal_to_paise(monthly_income),
        _flags_to_json(credit_flags),
        pan,
        aadhaar,
        created_at,
    )
    cursor = conn.execute(_INSERT_SQL, params)
    return cast(int, cursor.lastrowid)


def mark_submitted(
    conn: sqlite3.Connection, application_id: int, policy_version: int, submitted_at: str
) -> None:
    """Set status to SUBMITTED, pin `policy_version`, and record
    `submitted_at`. Caller commits (SG-8)."""
    conn.execute(
        "UPDATE applications SET status = 'SUBMITTED', policy_version = ?,"
        " submitted_at = ? WHERE id = ?",
        (policy_version, submitted_at, application_id),
    )


def mark_decided(conn: sqlite3.Connection, application_id: int, status: ApplicationStatus) -> None:
    """Map the underwriting decision onto `applications.status`
    (APPROVED/REJECTED/MANUAL_REVIEW). Caller commits (E3-S3)."""
    conn.execute("UPDATE applications SET status = ? WHERE id = ?", (status, application_id))


def transition_status(
    conn: sqlite3.Connection,
    application_id: int,
    from_status: ApplicationStatus,
    to_status: ApplicationStatus,
) -> bool:
    """Conditional status change; `False` when the row is not in `from_status`
    (a concurrent resolution got there first). Caller commits (E3-S5)."""
    cursor = conn.execute(
        "UPDATE applications SET status = ? WHERE id = ? AND status = ?",
        (to_status, application_id, from_status),
    )
    return cursor.rowcount == 1


def get_by_id(conn: sqlite3.Connection, application_id: int) -> ApplicationRecord | None:
    """The row for `application_id`, or `None` if it does not exist."""
    row = conn.execute(
        f"SELECT {_COLUMNS} FROM applications WHERE id = ?", (application_id,)
    ).fetchone()
    return _to_record(row) if row is not None else None


def _flags_to_json(flags: CreditFlags) -> str:
    return json.dumps(
        {
            "prior_default": flags.prior_default,
            "missed_payment_12m": flags.missed_payment_12m,
            "thin_file": flags.thin_file,
        }
    )


def _flags_from_json(raw: str) -> CreditFlags:
    data = json.loads(raw)
    return CreditFlags(
        prior_default=data["prior_default"],
        missed_payment_12m=data["missed_payment_12m"],
        thin_file=data["thin_file"],
    )


def _to_record(row: _Row) -> ApplicationRecord:
    (
        app_id, applicant_user_id, product_type, amount_paise, tenure_months, age_years,
        income_paise, flags_json, pan, aadhaar, status, policy_version, created_at,
        submitted_at,
    ) = row
    return ApplicationRecord(
        id=app_id,
        applicant_user_id=applicant_user_id,
        product_type=cast(ProductType, product_type),
        requested_amount=paise_to_decimal(amount_paise),
        tenure_months=tenure_months,
        age_years=age_years,
        monthly_income=paise_to_decimal(income_paise),
        credit_flags=_flags_from_json(flags_json),
        pan=pan,
        aadhaar=aadhaar,
        status=cast(ApplicationStatus, status),
        policy_version=policy_version,
        created_at=created_at,
        submitted_at=submitted_at,
    )
