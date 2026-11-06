"""GET /api/verification-queue and POST /api/documents/{id}/verify
(UNDERWRITER only, E3-S1)."""

from __future__ import annotations

import sqlite3
from uuid import uuid4

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from truelend.api.deps import get_clock, get_conn, require_roles
from truelend.repository.documents_repo import DocumentRecord
from truelend.service.verification_service import (
    QueuePageView,
    VerifyOutcome,
    decide_document,
    list_queue,
)
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import DocumentStatus, DocumentType

router = APIRouter(tags=["verification"])


class VerificationQueueItemResponse(BaseModel):
    document_id: int
    application_id: int
    type: DocumentType
    uploaded_at: str


class VerificationQueuePageResponse(BaseModel):
    items: list[VerificationQueueItemResponse]
    total: int
    limit: int
    offset: int


class VerifyDocumentRequest(BaseModel):
    outcome: VerifyOutcome
    reason: str = Field(min_length=1, max_length=500)


class DocumentResponse(BaseModel):
    id: int
    application_id: int
    type: DocumentType
    status: DocumentStatus
    filename: str | None
    reason: str | None
    uploaded_at: str | None
    verified_by: int | None
    verified_at: str | None


def _to_queue_response(page: QueuePageView) -> VerificationQueuePageResponse:
    return VerificationQueuePageResponse(
        items=[
            VerificationQueueItemResponse(
                document_id=item.document_id,
                application_id=item.application_id,
                type=item.type,
                uploaded_at=item.uploaded_at,
            )
            for item in page.items
        ],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


def _to_document_response(record: DocumentRecord) -> DocumentResponse:
    return DocumentResponse(
        id=record.id,
        application_id=record.application_id,
        type=record.type,
        status=record.status,
        filename=record.filename,
        reason=record.reason,
        uploaded_at=record.uploaded_at,
        verified_by=record.verified_by,
        verified_at=record.verified_at,
    )


def _correlation_id(request: Request) -> str:
    return getattr(request.state, "correlation_id", None) or str(uuid4())


@router.get("/api/verification-queue", response_model=VerificationQueuePageResponse)
def list_verification_queue_route(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    conn: sqlite3.Connection = Depends(get_conn),
    principal: AuthPrincipal = Depends(require_roles("UNDERWRITER")),
) -> VerificationQueuePageResponse:
    del principal  # guard only; the queue is not filtered per-actor
    return _to_queue_response(list_queue(conn, limit=limit, offset=offset))


@router.post("/api/documents/{document_id}/verify", response_model=DocumentResponse)
def verify_document_route(
    document_id: int,
    body: VerifyDocumentRequest,
    request: Request,
    conn: sqlite3.Connection = Depends(get_conn),
    clock: Clock = Depends(get_clock),
    principal: AuthPrincipal = Depends(require_roles("UNDERWRITER")),
) -> DocumentResponse:
    record = decide_document(
        conn,
        clock,
        document_id,
        outcome=body.outcome,
        reason=body.reason,
        principal=principal,
        correlation_id=_correlation_id(request),
    )
    return _to_document_response(record)
