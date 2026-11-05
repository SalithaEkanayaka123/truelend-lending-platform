"""POST /api/applications (CUSTOMER only) and GET /api/applications/{id}
(owner or staff) -- apply for a loan (E2-S2)."""

from __future__ import annotations

import sqlite3
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from truelend.api.deps import get_clock, get_conn, get_current_principal, require_roles
from truelend.config.money import decimal_to_wire
from truelend.service.application_service import (
    ApplicationView,
    ApplyRequest,
    ChecklistItemView,
    apply,
    get_for_owner,
)
from truelend.types.contracts import AuthPrincipal, Clock, CreditFlags
from truelend.types.enums import ApplicationStatus, DocumentStatus, DocumentType, ProductType

router = APIRouter(prefix="/api/applications", tags=["applications"])

_MONEY_PATTERN = r"^[0-9]+\.[0-9]{2}$"
_PAN_PATTERN = r"^[A-Z]{5}[0-9]{4}[A-Z]$"
_AADHAAR_PATTERN = r"^[0-9]{12}$"


class CreditFlagsBody(BaseModel):
    prior_default: bool
    missed_payment_12m: bool
    thin_file: bool


class CreateApplicationRequest(BaseModel):
    product_type: ProductType
    requested_amount: str = Field(pattern=_MONEY_PATTERN)
    tenure_months: int
    age_years: int
    monthly_income: str = Field(pattern=_MONEY_PATTERN)
    credit_flags: CreditFlagsBody
    pan: str = Field(pattern=_PAN_PATTERN)
    aadhaar: str = Field(pattern=_AADHAAR_PATTERN)


class DocumentChecklistItemResponse(BaseModel):
    document_id: int
    type: DocumentType
    status: DocumentStatus
    filename: str | None
    reason: str | None


class ApplicationResponse(BaseModel):
    id: int
    applicant_user_id: int
    product_type: ProductType
    requested_amount: str
    tenure_months: int
    age_years: int
    monthly_income: str
    credit_flags: CreditFlagsBody
    pan_masked: str
    aadhaar_masked: str
    status: ApplicationStatus
    policy_version: int | None
    required_documents: list[DocumentChecklistItemResponse]
    created_at: str
    submitted_at: str | None


def _to_checklist_response(item: ChecklistItemView) -> DocumentChecklistItemResponse:
    return DocumentChecklistItemResponse(
        document_id=item.document_id,
        type=item.type,
        status=item.status,
        filename=item.filename,
        reason=item.reason,
    )


def _to_response(view: ApplicationView) -> ApplicationResponse:
    return ApplicationResponse(
        id=view.id,
        applicant_user_id=view.applicant_user_id,
        product_type=view.product_type,
        requested_amount=decimal_to_wire(view.requested_amount),
        tenure_months=view.tenure_months,
        age_years=view.age_years,
        monthly_income=decimal_to_wire(view.monthly_income),
        credit_flags=CreditFlagsBody(
            prior_default=view.credit_flags.prior_default,
            missed_payment_12m=view.credit_flags.missed_payment_12m,
            thin_file=view.credit_flags.thin_file,
        ),
        pan_masked=view.pan_masked,
        aadhaar_masked=view.aadhaar_masked,
        status=view.status,
        policy_version=view.policy_version,
        required_documents=[_to_checklist_response(item) for item in view.required_documents],
        created_at=view.created_at,
        submitted_at=view.submitted_at,
    )


def _to_apply_request(body: CreateApplicationRequest, applicant_user_id: int) -> ApplyRequest:
    return ApplyRequest(
        applicant_user_id=applicant_user_id,
        product_type=body.product_type,
        requested_amount=Decimal(body.requested_amount),
        tenure_months=body.tenure_months,
        age_years=body.age_years,
        monthly_income=Decimal(body.monthly_income),
        credit_flags=CreditFlags(
            prior_default=body.credit_flags.prior_default,
            missed_payment_12m=body.credit_flags.missed_payment_12m,
            thin_file=body.credit_flags.thin_file,
        ),
        pan=body.pan,
        aadhaar=body.aadhaar,
    )


@router.post("", response_model=ApplicationResponse, status_code=201)
def apply_route(
    body: CreateApplicationRequest,
    conn: sqlite3.Connection = Depends(get_conn),
    clock: Clock = Depends(get_clock),
    principal: AuthPrincipal = Depends(require_roles("CUSTOMER")),
) -> ApplicationResponse:
    request = _to_apply_request(body, principal.user_id)
    return _to_response(apply(conn, clock, request))


@router.get("/{application_id}", response_model=ApplicationResponse)
def get_application_route(
    application_id: int,
    conn: sqlite3.Connection = Depends(get_conn),
    principal: AuthPrincipal = Depends(get_current_principal),
) -> ApplicationResponse:
    return _to_response(get_for_owner(conn, application_id, principal))
