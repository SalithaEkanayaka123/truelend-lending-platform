"""Application document-checklist repository (E2-S2): insert the `MISSING`
rows generated from a product's required documents, and read them back in
insertion order.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import cast

from truelend.types.enums import DocumentStatus, DocumentType

_COLUMNS = "id, type, status, filename, reason"


@dataclass(frozen=True)
class ChecklistItemRecord:
    """A row from `application_documents`."""

    document_id: int
    type: DocumentType
    status: DocumentStatus
    filename: str | None
    reason: str | None


def insert_checklist(
    conn: sqlite3.Connection, application_id: int, document_types: list[DocumentType]
) -> None:
    """Insert one `MISSING` row per required document type, in order.
    Caller commits together with the application insert (SG-8)."""
    conn.executemany(
        "INSERT INTO application_documents (application_id, type, status)"
        " VALUES (?, ?, 'MISSING')",
        [(application_id, doc_type) for doc_type in document_types],
    )


def mark_uploaded(
    conn: sqlite3.Connection,
    application_id: int,
    document_type: DocumentType,
    filename: str,
    uploaded_at: str,
) -> None:
    """Set one checklist row to UPLOADED, record `filename`/`uploaded_at`,
    and clear any prior rejection reason -- this also resets a REJECTED row
    back to UPLOADED. Caller commits (SG-8)."""
    conn.execute(
        "UPDATE application_documents SET status = 'UPLOADED', filename = ?,"
        " reason = NULL, uploaded_at = ? WHERE application_id = ? AND type = ?",
        (filename, uploaded_at, application_id, document_type),
    )


def get_checklist(conn: sqlite3.Connection, application_id: int) -> list[ChecklistItemRecord]:
    """The checklist for one application, ascending by insertion order."""
    rows = conn.execute(
        f"SELECT {_COLUMNS} FROM application_documents WHERE application_id = ? ORDER BY id ASC",
        (application_id,),
    ).fetchall()
    return [_to_record(row) for row in rows]


def _to_record(row: tuple[int, str, str, str | None, str | None]) -> ChecklistItemRecord:
    document_id, doc_type, status, filename, reason = row
    return ChecklistItemRecord(
        document_id=document_id,
        type=cast(DocumentType, doc_type),
        status=cast(DocumentStatus, status),
        filename=filename,
        reason=reason,
    )


# -- E3-S1: verification queue and verify/reject -----------------------------

_QUEUE_COLUMNS = "id, application_id, type, uploaded_at"
_DOCUMENT_COLUMNS = (
    "id, application_id, type, status, filename, reason, uploaded_at, verified_by, verified_at"
)


@dataclass(frozen=True)
class QueueItemRecord:
    """One UPLOADED row surfaced in the verification queue."""

    document_id: int
    application_id: int
    type: DocumentType
    uploaded_at: str


@dataclass(frozen=True)
class QueuePage:
    """A page of `QueueItemRecord`s plus pagination metadata."""

    items: list[QueueItemRecord]
    total: int
    limit: int
    offset: int


@dataclass(frozen=True)
class DocumentRecord:
    """A single `application_documents` row, independent of any checklist."""

    id: int
    application_id: int
    type: DocumentType
    status: DocumentStatus
    filename: str | None
    reason: str | None
    uploaded_at: str | None
    verified_by: int | None
    verified_at: str | None


def list_uploaded_queue(conn: sqlite3.Connection, limit: int, offset: int) -> QueuePage:
    """UPLOADED documents across every application, oldest-uploaded first.

    No index backs `(status, uploaded_at)` yet -- this is a synthetic-data
    demo table (bounded rows); add one in a future migration if the table
    ever grows past demo scale."""
    total = cast(
        int,
        conn.execute(
            "SELECT COUNT(*) FROM application_documents WHERE status = 'UPLOADED'"
        ).fetchone()[0],
    )
    rows = conn.execute(
        f"SELECT {_QUEUE_COLUMNS} FROM application_documents WHERE status = 'UPLOADED'"
        " ORDER BY uploaded_at ASC, id ASC LIMIT ? OFFSET ?",
        (limit, offset),
    ).fetchall()
    return QueuePage(
        items=[_to_queue_record(row) for row in rows], total=total, limit=limit, offset=offset
    )


def get_by_id(conn: sqlite3.Connection, document_id: int) -> DocumentRecord | None:
    """The row for `document_id`, or `None` if it does not exist."""
    row = conn.execute(
        f"SELECT {_DOCUMENT_COLUMNS} FROM application_documents WHERE id = ?", (document_id,)
    ).fetchone()
    return _to_document_record(row) if row is not None else None


def mark_verified(
    conn: sqlite3.Connection, document_id: int, verified_by: int, verified_at: str
) -> None:
    """Set VERIFIED (final), clear any prior reason, record who/when.
    Caller commits together with the audit write (E1-S2-AC4)."""
    conn.execute(
        "UPDATE application_documents SET status = 'VERIFIED', reason = NULL,"
        " verified_by = ?, verified_at = ? WHERE id = ?",
        (verified_by, verified_at, document_id),
    )


def mark_rejected(
    conn: sqlite3.Connection, document_id: int, reason: str, verified_by: int, verified_at: str
) -> None:
    """Set REJECTED with `reason`, record who/when. Caller commits together
    with the audit write (E1-S2-AC4)."""
    conn.execute(
        "UPDATE application_documents SET status = 'REJECTED', reason = ?,"
        " verified_by = ?, verified_at = ? WHERE id = ?",
        (reason, verified_by, verified_at, document_id),
    )


def _to_queue_record(row: tuple[int, int, str, str]) -> QueueItemRecord:
    document_id, application_id, doc_type, uploaded_at = row
    return QueueItemRecord(
        document_id=document_id,
        application_id=application_id,
        type=cast(DocumentType, doc_type),
        uploaded_at=uploaded_at,
    )


def _to_document_record(
    row: tuple[int, int, str, str, str | None, str | None, str | None, int | None, str | None],
) -> DocumentRecord:
    (
        doc_id,
        application_id,
        doc_type,
        status,
        filename,
        reason,
        uploaded_at,
        verified_by,
        verified_at,
    ) = row
    return DocumentRecord(
        id=doc_id,
        application_id=application_id,
        type=cast(DocumentType, doc_type),
        status=cast(DocumentStatus, status),
        filename=filename,
        reason=reason,
        uploaded_at=uploaded_at,
        verified_by=verified_by,
        verified_at=verified_at,
    )
