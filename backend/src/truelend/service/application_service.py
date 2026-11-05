"""Application intake (E2-S2): create a DRAFT with a per-product document
checklist, range-validate amount/tenure against the active policy, and mask
PAN/Aadhaar on every read. Raw PAN/Aadhaar are stored but never returned
(FA-F2.3). SG-8: no update-after-submit or delete path exists here.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC
from decimal import Decimal
from pathlib import Path

from truelend.repository import applications_repo, documents_repo
from truelend.repository.applications_repo import ApplicationRecord
from truelend.repository.documents_repo import ChecklistItemRecord
from truelend.service.policy_service import ProductRule, get_active_catalog
from truelend.types.contracts import AuthPrincipal, Clock, CreditFlags
from truelend.types.enums import ApplicationStatus, DocumentStatus, DocumentType, ProductType
from truelend.types.errors import AmountOutOfRangeError, NotFoundError, TenureOutOfRangeError


@dataclass(frozen=True)
class ApplyRequest:
    """Validated input to `apply` (API layer owns PAN/Aadhaar/money format)."""

    applicant_user_id: int
    product_type: ProductType
    requested_amount: Decimal
    tenure_months: int
    age_years: int
    monthly_income: Decimal
    credit_flags: CreditFlags
    pan: str
    aadhaar: str


@dataclass(frozen=True)
class ChecklistItemView:
    document_id: int
    type: DocumentType
    status: DocumentStatus
    filename: str | None
    reason: str | None


@dataclass(frozen=True)
class ApplicationView:
    """A caller-facing application: masked PAN/Aadhaar, never raw."""

    id: int
    applicant_user_id: int
    product_type: ProductType
    requested_amount: Decimal
    tenure_months: int
    age_years: int
    monthly_income: Decimal
    credit_flags: CreditFlags
    pan_masked: str
    aadhaar_masked: str
    status: ApplicationStatus
    policy_version: int | None
    required_documents: list[ChecklistItemView]
    created_at: str
    submitted_at: str | None


def apply(
    conn: sqlite3.Connection, clock: Clock, request: ApplyRequest, *, policies_dir: Path
) -> ApplicationView:
    """Create a DRAFT application and its MISSING-document checklist in one
    transaction (single owner of both inserts, SG-8)."""
    rule = _rule_for(conn, request.product_type, policies_dir=policies_dir)
    _validate_range(rule, request.requested_amount, request.tenure_months)
    created_at = clock.now().astimezone(UTC).isoformat()
    application_id = applications_repo.insert_application(
        conn,
        applicant_user_id=request.applicant_user_id,
        product_type=request.product_type,
        requested_amount=request.requested_amount,
        tenure_months=request.tenure_months,
        age_years=request.age_years,
        monthly_income=request.monthly_income,
        credit_flags=request.credit_flags,
        pan=request.pan,
        aadhaar=request.aadhaar,
        created_at=created_at,
    )
    documents_repo.insert_checklist(conn, application_id, rule.required_documents)
    conn.commit()
    return _load_view(conn, application_id)


def get_for_owner(
    conn: sqlite3.Connection, application_id: int, principal: AuthPrincipal
) -> ApplicationView:
    """Raise `NotFoundError` for a missing application or one a CUSTOMER
    does not own (FA-F2.8); staff roles may view any application."""
    record = applications_repo.get_by_id(conn, application_id)
    if record is None or _is_hidden_from(record, principal):
        raise NotFoundError("NOT_FOUND", "Application not found.")
    return _to_view(record, documents_repo.get_checklist(conn, application_id))


def _is_hidden_from(record: ApplicationRecord, principal: AuthPrincipal) -> bool:
    return principal.role == "CUSTOMER" and record.applicant_user_id != principal.user_id


def _rule_for(
    conn: sqlite3.Connection, product_type: ProductType, *, policies_dir: Path
) -> ProductRule:
    catalog = {rule.product_type: rule for rule in get_active_catalog(conn, policies_dir)}
    return catalog[product_type]


def _validate_range(rule: ProductRule, amount: Decimal, tenure_months: int) -> None:
    if not (rule.min_tenure_months <= tenure_months <= rule.max_tenure_months):
        raise TenureOutOfRangeError(
            f"Tenure must be between {rule.min_tenure_months} and"
            f" {rule.max_tenure_months} months."
        )
    if not (rule.min_amount <= amount <= rule.max_amount):
        raise AmountOutOfRangeError(
            f"Amount must be between {rule.min_amount} and {rule.max_amount}."
        )


def _load_view(conn: sqlite3.Connection, application_id: int) -> ApplicationView:
    record = applications_repo.get_by_id(conn, application_id)
    assert record is not None  # just inserted on this same connection
    return _to_view(record, documents_repo.get_checklist(conn, application_id))


def _to_view(record: ApplicationRecord, checklist: list[ChecklistItemRecord]) -> ApplicationView:
    return ApplicationView(
        id=record.id,
        applicant_user_id=record.applicant_user_id,
        product_type=record.product_type,
        requested_amount=record.requested_amount,
        tenure_months=record.tenure_months,
        age_years=record.age_years,
        monthly_income=record.monthly_income,
        credit_flags=record.credit_flags,
        pan_masked=_mask_pan(record.pan),
        aadhaar_masked=_mask_aadhaar(record.aadhaar),
        status=record.status,
        policy_version=record.policy_version,
        required_documents=[_to_checklist_view(item) for item in checklist],
        created_at=record.created_at,
        submitted_at=record.submitted_at,
    )


def _to_checklist_view(item: ChecklistItemRecord) -> ChecklistItemView:
    return ChecklistItemView(
        document_id=item.document_id,
        type=item.type,
        status=item.status,
        filename=item.filename,
        reason=item.reason,
    )


def _mask_pan(pan: str) -> str:
    return f"{'*' * 6}{pan[-4:]}"


def _mask_aadhaar(aadhaar: str) -> str:
    return f"{'*' * 8}{aadhaar[-4:]}"
