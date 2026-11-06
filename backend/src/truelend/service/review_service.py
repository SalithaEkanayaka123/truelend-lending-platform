"""Manual review and override of underwriting decisions (E3-S5).

An UNDERWRITER resolves a MANUAL_REVIEW application (approve or reject); an
UNDERWRITER or ADMIN overrides an unresolved AUTO_REJECT to APPROVED with a
policy-listed reason code and a comment. The `decisions` row is never
touched: the human outcome is one append-only `resolutions` row, written with
the status change and its audit row in a single transaction, so any failure
leaves no partial state (FA-F0.4).
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC
from pathlib import Path
from typing import Literal

from truelend.repository import applications_repo, audit_repo, decisions_repo, resolutions_repo
from truelend.repository.applications_repo import ApplicationRecord
from truelend.repository.decisions_repo import DecisionRecord
from truelend.repository.resolutions_repo import ResolutionRecord
from truelend.service.policy_service import get_catalog_for_version, get_decision_vocabulary
from truelend.service.underwriting_service import publish_application_approved
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import ApplicationStatus, DecisionType, ResolutionKind, ResolutionOutcome
from truelend.types.errors import (
    ConflictError,
    NotDecidedError,
    NotFoundError,
    NotInReviewError,
    NotOverridableError,
    ValidationError,
)

ReviewOutcome = Literal["APPROVE", "REJECT"]


@dataclass(frozen=True)
class ReasonCodeView:
    code: str
    message: str


@dataclass(frozen=True)
class DecisionDetail:
    application_id: int
    status: ApplicationStatus
    decision: DecisionType
    score: int
    reason_codes: list[ReasonCodeView]
    policy_version: int
    decided_at: str
    thresholds: dict[str, int | None]
    override_reason_codes: list[str]
    resolution: ResolutionRecord | None


@dataclass(frozen=True)
class _Resolve:
    """One resolution to record: what changes, who did it, and why."""

    kind: ResolutionKind
    outcome: ResolutionOutcome
    action: str
    reason_code: str | None
    comment: str
    principal: AuthPrincipal
    correlation_id: str


def get_decision_detail(
    conn: sqlite3.Connection,
    application_id: int,
    principal: AuthPrincipal,
    *,
    policies_dir: Path,
) -> DecisionDetail:
    """The stored decision with reason-code messages, the pinned policy's
    thresholds and override codes, and any resolution. A CUSTOMER sees only
    their own application; a missing decision is `NotDecidedError` (404)."""
    record = _load(conn, application_id)
    if principal.role == "CUSTOMER" and record.applicant_user_id != principal.user_id:
        raise NotFoundError("NOT_FOUND", "Application not found.")
    decision = decisions_repo.get_by_application(conn, application_id)
    if decision is None:
        raise NotDecidedError()
    return _detail(conn, record, decision, policies_dir)


def review(
    conn: sqlite3.Connection,
    clock: Clock,
    application_id: int,
    *,
    outcome: ReviewOutcome,
    reason: str,
    principal: AuthPrincipal,
    correlation_id: str,
    policies_dir: Path,
) -> DecisionDetail:
    """Approve or reject an application in MANUAL_REVIEW (AC1/AC2)."""
    record = _load(conn, application_id)
    if record.status != "MANUAL_REVIEW":
        raise NotInReviewError()
    approved = outcome == "APPROVE"
    change = _Resolve(
        kind="MANUAL_REVIEW",
        outcome="APPROVED" if approved else "REJECTED",
        action="REVIEW_APPROVED" if approved else "REVIEW_REJECTED",
        reason_code=None,
        comment=reason,
        principal=principal,
        correlation_id=correlation_id,
    )
    _resolve(conn, clock, record, change, NotInReviewError())
    return get_decision_detail(conn, application_id, principal, policies_dir=policies_dir)


def override(
    conn: sqlite3.Connection,
    clock: Clock,
    application_id: int,
    *,
    reason_code: str,
    comment: str,
    principal: AuthPrincipal,
    correlation_id: str,
    policies_dir: Path,
) -> DecisionDetail:
    """Override an unresolved AUTO_REJECT to APPROVED (AC3/AC4/AC5)."""
    record = _load(conn, application_id)
    _require_overridable(conn, record, reason_code, policies_dir)
    change = _Resolve(
        kind="OVERRIDE",
        outcome="APPROVED",
        action="DECISION_OVERRIDDEN",
        reason_code=reason_code,
        comment=comment,
        principal=principal,
        correlation_id=correlation_id,
    )
    _resolve(conn, clock, record, change, NotOverridableError())
    return get_decision_detail(conn, application_id, principal, policies_dir=policies_dir)


def _require_overridable(
    conn: sqlite3.Connection, record: ApplicationRecord, reason_code: str, policies_dir: Path
) -> None:
    decision = decisions_repo.get_by_application(conn, record.id)
    if (
        decision is None
        or decision.decision != "AUTO_REJECT"
        or record.status != "REJECTED"
        or resolutions_repo.get_by_application(conn, record.id) is not None
    ):
        raise NotOverridableError()
    _, allowed = get_decision_vocabulary(conn, policies_dir, decision.policy_version)
    if reason_code not in allowed:
        raise ValidationError(
            "VALIDATION_ERROR", f"reason_code must be one of: {', '.join(allowed)}."
        )


def _resolve(
    conn: sqlite3.Connection,
    clock: Clock,
    record: ApplicationRecord,
    change: _Resolve,
    conflict: ConflictError,
) -> None:
    """Status change, resolution row and audit row in one transaction."""
    new_status: ApplicationStatus = "APPROVED" if change.outcome == "APPROVED" else "REJECTED"
    if not applications_repo.transition_status(conn, record.id, record.status, new_status):
        conn.rollback()
        raise conflict
    try:
        _write_rows(conn, clock, record, new_status, change)
        conn.commit()
    except sqlite3.DatabaseError:
        conn.rollback()
        raise conflict from None
    if new_status == "APPROVED":
        publish_application_approved(record.id)


def _write_rows(
    conn: sqlite3.Connection,
    clock: Clock,
    record: ApplicationRecord,
    new_status: ApplicationStatus,
    change: _Resolve,
) -> None:
    resolutions_repo.insert(
        conn,
        application_id=record.id,
        kind=change.kind,
        outcome=change.outcome,
        reason_code=change.reason_code,
        comment=change.comment,
        resolved_by=change.principal.user_id,
        resolved_at=clock.now().astimezone(UTC).isoformat(),
    )
    audit_repo.insert(
        conn,
        clock,
        actor=change.principal,
        action=change.action,
        entity_type="application",
        entity_id=record.id,
        correlation_id=change.correlation_id,
        reason_code=change.reason_code,
        comment=change.comment,
        before_status=record.status,
        after_status=new_status,
    )


def _load(conn: sqlite3.Connection, application_id: int) -> ApplicationRecord:
    record = applications_repo.get_by_id(conn, application_id)
    if record is None:
        raise NotFoundError("NOT_FOUND", "Application not found.")
    return record


def _detail(
    conn: sqlite3.Connection,
    record: ApplicationRecord,
    decision: DecisionRecord,
    policies_dir: Path,
) -> DecisionDetail:
    messages, override_codes = get_decision_vocabulary(conn, policies_dir, decision.policy_version)
    rule = next(
        r
        for r in get_catalog_for_version(conn, policies_dir, decision.policy_version)
        if r.product_type == record.product_type
    )
    return DecisionDetail(
        application_id=record.id,
        status=record.status,
        decision=decision.decision,
        score=decision.score,
        reason_codes=[ReasonCodeView(c, messages.get(c, c)) for c in decision.reason_codes],
        policy_version=decision.policy_version,
        decided_at=decision.decided_at,
        thresholds={
            "auto_reject_below_score": rule.auto_reject_below_score,
            "auto_approve_min_score": rule.auto_approve_min_score,
        },
        override_reason_codes=override_codes,
        resolution=resolutions_repo.get_by_application(conn, record.id),
    )
