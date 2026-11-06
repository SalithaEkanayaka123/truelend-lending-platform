"""POST /api/applications/{id}/review (UNDERWRITER), POST .../override
(UNDERWRITER, ADMIN) and GET .../decision (owner CUSTOMER, staff) -- manual
review and override of underwriting decisions (E3-S5)."""

from __future__ import annotations

import sqlite3
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from truelend.api.deps import get_app_settings, get_clock, get_conn, require_roles
from truelend.config.settings import Settings
from truelend.service import review_service
from truelend.service.review_service import DecisionDetail
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import (
    ApplicationStatus,
    DecisionType,
    ResolutionKind,
    ResolutionOutcome,
)

router = APIRouter(prefix="/api/applications", tags=["review"])


class ReviewRequest(BaseModel):
    outcome: Literal["APPROVE", "REJECT"]
    reason: str = Field(min_length=1, max_length=500)


class OverrideRequest(BaseModel):
    reason_code: str = Field(min_length=1, max_length=100)
    comment: str = Field(min_length=1, max_length=500)


class ReasonCodeResponse(BaseModel):
    code: str
    message: str


class ThresholdsResponse(BaseModel):
    auto_reject_below_score: int | None
    auto_approve_min_score: int | None


class ResolutionResponse(BaseModel):
    kind: ResolutionKind
    outcome: ResolutionOutcome
    reason_code: str | None
    comment: str
    resolved_by: int
    resolved_at: str


class DecisionDetailResponse(BaseModel):
    application_id: int
    status: ApplicationStatus
    decision: DecisionType
    score: int
    reason_codes: list[ReasonCodeResponse]
    policy_version: int
    decided_at: str
    thresholds: ThresholdsResponse
    override_reason_codes: list[str]
    resolution: ResolutionResponse | None


def _correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", None) or str(uuid4())


def _to_response(detail: DecisionDetail) -> DecisionDetailResponse:
    resolution = detail.resolution
    return DecisionDetailResponse(
        application_id=detail.application_id,
        status=detail.status,
        decision=detail.decision,
        score=detail.score,
        reason_codes=[
            ReasonCodeResponse(code=r.code, message=r.message) for r in detail.reason_codes
        ],
        policy_version=detail.policy_version,
        decided_at=detail.decided_at,
        thresholds=ThresholdsResponse(**detail.thresholds),
        override_reason_codes=detail.override_reason_codes,
        resolution=(
            ResolutionResponse(
                kind=resolution.kind,
                outcome=resolution.outcome,
                reason_code=resolution.reason_code,
                comment=resolution.comment,
                resolved_by=resolution.resolved_by,
                resolved_at=resolution.resolved_at,
            )
            if resolution is not None
            else None
        ),
    )


@router.get("/{application_id}/decision", response_model=DecisionDetailResponse)
def get_decision_route(
    application_id: int,
    conn: sqlite3.Connection = Depends(get_conn),
    settings: Settings = Depends(get_app_settings),
    principal: AuthPrincipal = Depends(require_roles("CUSTOMER", "UNDERWRITER", "ADMIN")),
) -> DecisionDetailResponse:
    detail = review_service.get_decision_detail(
        conn, application_id, principal, policies_dir=settings.policies_dir
    )
    return _to_response(detail)


@router.post("/{application_id}/review", response_model=DecisionDetailResponse)
def review_route(
    application_id: int,
    body: ReviewRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_conn),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_app_settings),
    principal: AuthPrincipal = Depends(require_roles("UNDERWRITER")),
) -> DecisionDetailResponse:
    detail = review_service.review(
        conn,
        clock,
        application_id,
        outcome=body.outcome,
        reason=body.reason,
        principal=principal,
        correlation_id=_correlation_id(request),
        policies_dir=settings.policies_dir,
    )
    return _to_response(detail)


@router.post("/{application_id}/override", response_model=DecisionDetailResponse)
def override_route(
    application_id: int,
    body: OverrideRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_conn),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_app_settings),
    principal: AuthPrincipal = Depends(require_roles("UNDERWRITER", "ADMIN")),
) -> DecisionDetailResponse:
    detail = review_service.override(
        conn,
        clock,
        application_id,
        reason_code=body.reason_code,
        comment=body.comment,
        principal=principal,
        correlation_id=_correlation_id(request),
        policies_dir=settings.policies_dir,
    )
    return _to_response(detail)
