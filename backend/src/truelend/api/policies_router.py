"""POST /api/policies (POLICY_EDITOR or ADMIN), POST /api/policies/{version}/
approve (ADMIN only), and GET /api/policies/{version} (POLICY_EDITOR or
ADMIN) -- create and approve policy versions (E4-S1). No PUT/PATCH/DELETE
route exists on this prefix: Starlette returns 405 for those verbs against
`/api/policies/{version}` because the GET route below already matches that
exact path pattern (AC4).
"""

from __future__ import annotations

import sqlite3
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel

from truelend.api.deps import get_app_settings, get_clock, get_conn, require_roles
from truelend.config.settings import Settings
from truelend.repository.policy_repo import PolicyVersionRecord, list_versions
from truelend.repository.users_repo import display_names
from truelend.service.policy_service import approve_policy, create_policy, get_policy
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import DocumentType, PolicyStatus, ProductType

router = APIRouter(prefix="/api/policies", tags=["policies"])


class ProductChangeBody(BaseModel):
    """A partial patch for one product (all fields optional)."""

    min_age: int | None = None
    max_age: int | None = None
    min_income: str | None = None
    min_tenure_months: int | None = None
    max_tenure_months: int | None = None
    min_amount: str | None = None
    max_amount: str | None = None
    annual_rate_pct: str | None = None
    auto_reject_below_score: int | None = None
    auto_approve_min_score: int | None = None
    required_documents: list[DocumentType] | None = None


class CreatePolicyRequest(BaseModel):
    base_version: int
    changes: dict[ProductType, ProductChangeBody]


class PolicyVersionResponse(BaseModel):
    version: int
    status: PolicyStatus
    base_version: int | None
    created_by: int
    created_at: str
    approved_by: int | None
    approved_at: str | None
    created_by_name: str | None = None
    approved_by_name: str | None = None


class PolicyVersionPageResponse(BaseModel):
    items: list[PolicyVersionResponse]
    total: int
    limit: int
    offset: int


def _correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", None) or str(uuid4())


def _names(conn: sqlite3.Connection, records: list[PolicyVersionRecord]) -> dict[int, str | None]:
    ids = {r.created_by for r in records}
    ids |= {r.approved_by for r in records if r.approved_by is not None}
    return display_names(conn, ids)


def _to_response(
    record: PolicyVersionRecord, names: dict[int, str | None]
) -> PolicyVersionResponse:
    approver = record.approved_by
    return PolicyVersionResponse(
        created_by_name=names.get(record.created_by),
        approved_by_name=names.get(approver) if approver is not None else None,
        version=record.version,
        status=record.status,
        base_version=record.base_version,
        created_by=record.created_by,
        created_at=record.created_at,
        approved_by=record.approved_by,
        approved_at=record.approved_at,
    )


def _changes_payload(body: CreatePolicyRequest) -> dict[str, dict[str, Any]]:
    return {
        product_type: change.model_dump(exclude_none=True)
        for product_type, change in body.changes.items()
    }


@router.post("", response_model=PolicyVersionResponse, status_code=201)
def create_policy_route(
    body: CreatePolicyRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_conn),
    clock: Clock = Depends(get_clock),
    settings: Settings = Depends(get_app_settings),
    principal: AuthPrincipal = Depends(require_roles("POLICY_EDITOR", "ADMIN")),
) -> PolicyVersionResponse:
    record = create_policy(
        conn,
        settings.policies_dir,
        clock,
        base_version=body.base_version,
        changes=_changes_payload(body),
        actor=principal,
        correlation_id=_correlation_id(request),
    )
    return _to_response(record, _names(conn, [record]))


@router.post("/{version}/approve", response_model=PolicyVersionResponse)
def approve_policy_route(
    version: int,
    request: Request,
    conn: sqlite3.Connection = Depends(get_conn),
    clock: Clock = Depends(get_clock),
    principal: AuthPrincipal = Depends(require_roles("ADMIN")),
) -> PolicyVersionResponse:
    record = approve_policy(
        conn, clock, version=version, actor=principal, correlation_id=_correlation_id(request)
    )
    return _to_response(record, _names(conn, [record]))


@router.get("", response_model=PolicyVersionPageResponse)
def list_policies_route(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    conn: sqlite3.Connection = Depends(get_conn),
    principal: AuthPrincipal = Depends(require_roles("POLICY_EDITOR", "ADMIN")),
) -> PolicyVersionPageResponse:
    del principal  # guard only
    records = list_versions(conn)
    page = records[offset : offset + limit]
    names = _names(conn, page)
    return PolicyVersionPageResponse(
        items=[_to_response(r, names) for r in page],
        total=len(records),
        limit=limit,
        offset=offset,
    )


@router.get("/{version}", response_model=PolicyVersionResponse)
def get_policy_route(
    version: int,
    conn: sqlite3.Connection = Depends(get_conn),
    principal: AuthPrincipal = Depends(require_roles("POLICY_EDITOR", "ADMIN")),
) -> PolicyVersionResponse:
    del principal  # guard only
    record = get_policy(conn, version)
    return _to_response(record, _names(conn, [record]))
