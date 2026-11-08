"""Document upload and application submission (E2-S3): record document
metadata for the owner's checklist only -- no file content is accepted or
stored -- and submit once every required document is UPLOADED or later,
pinning the active policy version used for underwriting. SG-8: both
operations commit in a single transaction.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import UTC
from pathlib import Path

from truelend.repository import applications_repo, documents_repo
from truelend.service.application_service import ApplicationView, get_for_owner
from truelend.service.policy_service import get_active_catalog
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import DocumentStatus, DocumentType
from truelend.types.errors import (
    AlreadySubmittedError,
    DocumentTypeNotRequiredError,
    MissingDocumentsError,
)

_logger = logging.getLogger("truelend.events")

_NOT_YET_ACCEPTABLE: frozenset[DocumentStatus] = frozenset({"MISSING", "REJECTED"})


def upload_document(
    conn: sqlite3.Connection,
    clock: Clock,
    application_id: int,
    *,
    document_type: DocumentType,
    filename: str,
    principal: AuthPrincipal,
) -> ApplicationView:
    """Record `document_type` as UPLOADED for the owner's checklist
    (non-owner -> `NotFoundError`, FA-F2.8). `document_type` not on this
    application's checklist -> `DocumentTypeNotRequiredError` (AC2).
    Re-uploading a REJECTED document resets it to UPLOADED (AC1)."""
    view = get_for_owner(conn, application_id, principal)
    if not any(item.type == document_type for item in view.required_documents):
        raise DocumentTypeNotRequiredError(document_type)
    uploaded_at = clock.now().astimezone(UTC).isoformat()
    documents_repo.mark_uploaded(conn, application_id, document_type, filename, uploaded_at)
    conn.commit()
    updated = get_for_owner(conn, application_id, principal)
    uploaded = next(item for item in updated.required_documents if item.type == document_type)
    # Ids and type only: the filename is never logged (NFR-03).
    _logger.info(
        "DocumentUploaded",
        extra={
            "fields": {
                "application_id": application_id,
                "document_id": uploaded.document_id,
                "document_type": document_type,
            }
        },
    )
    return updated


def submit_application(
    conn: sqlite3.Connection,
    clock: Clock,
    application_id: int,
    *,
    principal: AuthPrincipal,
    policies_dir: Path,
) -> ApplicationView:
    """Submit a DRAFT application once every required document is UPLOADED
    or later, pinning the active policy version (SG-8, one transaction).
    Already submitted -> `AlreadySubmittedError` (AC5). Any MISSING/REJECTED
    document -> `MissingDocumentsError` naming those types; status stays
    DRAFT (AC3)."""
    view = get_for_owner(conn, application_id, principal)
    if view.status != "DRAFT":
        raise AlreadySubmittedError()
    missing = [
        item.type for item in view.required_documents if item.status in _NOT_YET_ACCEPTABLE
    ]
    if missing:
        raise MissingDocumentsError(missing)
    policy_version = get_active_catalog(conn, policies_dir)[0].policy_version
    submitted_at = clock.now().astimezone(UTC).isoformat()
    applications_repo.mark_submitted(conn, application_id, policy_version, submitted_at)
    conn.commit()
    return get_for_owner(conn, application_id, principal)
