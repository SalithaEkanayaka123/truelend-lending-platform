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
