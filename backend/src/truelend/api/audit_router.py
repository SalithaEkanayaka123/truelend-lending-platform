"""GET /api/audit — list audit log entries (ADMIN only, E1-S2)."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from truelend.api.deps import get_conn, require_roles
from truelend.repository.audit_repo import AuditEntryPage, list_entries
from truelend.types.contracts import AuthPrincipal
from truelend.types.enums import Role

router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditEntryResponse(BaseModel):
    id: int
    occurred_at: str
    actor_user_id: int
    actor_role: Role
    action: str
    entity_type: str
    entity_id: int
    correlation_id: str


class AuditEntryPageResponse(BaseModel):
    items: list[AuditEntryResponse]
    total: int
    limit: int
    offset: int


def _to_response(page: AuditEntryPage) -> AuditEntryPageResponse:
    return AuditEntryPageResponse(
        items=[
            AuditEntryResponse(
                id=item.id,
                occurred_at=item.occurred_at,
                actor_user_id=item.actor_user_id,
                actor_role=item.actor_role,
                action=item.action,
                entity_type=item.entity_type,
                entity_id=item.entity_id,
                correlation_id=item.correlation_id,
            )
            for item in page.items
        ],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


@router.get("", response_model=AuditEntryPageResponse)
def list_audit_route(
    entity_type: str | None = Query(default=None),
    entity_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    conn: sqlite3.Connection = Depends(get_conn),
    principal: AuthPrincipal = Depends(require_roles("ADMIN")),
) -> AuditEntryPageResponse:
    del principal  # guard only; the route has no per-actor filtering
    page = list_entries(
        conn,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        limit=limit,
        offset=offset,
    )
    return _to_response(page)
