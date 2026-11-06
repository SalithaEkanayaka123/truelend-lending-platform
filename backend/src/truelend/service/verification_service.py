"""Verification queue and document verify/reject decisions (E3-S1):
underwriters clear UPLOADED documents one at a time; VERIFIED is final.
Each decision writes its DOCUMENT_VERIFIED/DOCUMENT_REJECTED audit row in
the same transaction as the state change (E1-S2-AC4: no orphan audit row
on a 409 -- the already-VERIFIED check runs before any write).
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC
from typing import Literal

from truelend.repository import audit_repo, documents_repo
from truelend.repository.documents_repo import DocumentRecord, QueueItemRecord
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import DocumentType
from truelend.types.errors import AlreadyVerifiedError, NotFoundError

VerifyOutcome = Literal["VERIFIED", "REJECTED"]

_ACTION_BY_OUTCOME: dict[VerifyOutcome, str] = {
    "VERIFIED": "DOCUMENT_VERIFIED",
    "REJECTED": "DOCUMENT_REJECTED",
}


@dataclass(frozen=True)
class QueueItemView:
    document_id: int
    application_id: int
    type: DocumentType
    uploaded_at: str


@dataclass(frozen=True)
class QueuePageView:
    items: list[QueueItemView]
    total: int
    limit: int
    offset: int


def list_queue(conn: sqlite3.Connection, *, limit: int, offset: int) -> QueuePageView:
    """UPLOADED documents across every application, oldest-uploaded first
    (AC1)."""
    page = documents_repo.list_uploaded_queue(conn, limit, offset)
    return QueuePageView(
        items=[_to_queue_item(item) for item in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


def decide_document(
    conn: sqlite3.Connection,
    clock: Clock,
    document_id: int,
    *,
    outcome: VerifyOutcome,
    reason: str,
    principal: AuthPrincipal,
    correlation_id: str,
) -> DocumentRecord:
    """Verify or reject `document_id` and write the matching audit row in
    the same transaction (AC2/AC3). `NotFoundError` for an unknown
    document; `AlreadyVerifiedError` (409) for one already VERIFIED,
    raised before any write so no audit row is orphaned (AC5)."""
    _require_decidable(conn, document_id)
    decided_at = clock.now().astimezone(UTC).isoformat()
    _apply_outcome(conn, document_id, outcome, reason, principal.user_id, decided_at)
    audit_repo.insert(
        conn,
        clock,
        actor=principal,
        action=_ACTION_BY_OUTCOME[outcome],
        entity_type="document",
        entity_id=document_id,
        correlation_id=correlation_id,
    )
    conn.commit()
    decided = documents_repo.get_by_id(conn, document_id)
    assert decided is not None  # just updated on this same connection
    return decided


def _require_decidable(conn: sqlite3.Connection, document_id: int) -> None:
    record = documents_repo.get_by_id(conn, document_id)
    if record is None:
        raise NotFoundError("NOT_FOUND", "Document not found.")
    if record.status == "VERIFIED":
        raise AlreadyVerifiedError()


def _apply_outcome(
    conn: sqlite3.Connection,
    document_id: int,
    outcome: VerifyOutcome,
    reason: str,
    verified_by: int,
    decided_at: str,
) -> None:
    if outcome == "VERIFIED":
        documents_repo.mark_verified(conn, document_id, verified_by, decided_at)
    else:
        documents_repo.mark_rejected(conn, document_id, reason, verified_by, decided_at)


def _to_queue_item(item: QueueItemRecord) -> QueueItemView:
    return QueueItemView(
        document_id=item.document_id,
        application_id=item.application_id,
        type=item.type,
        uploaded_at=item.uploaded_at,
    )
