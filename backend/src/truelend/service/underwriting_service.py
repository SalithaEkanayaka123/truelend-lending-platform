"""Underwriting decision with reason codes (E3-S3): deterministic rule
engine over the application's pinned policy version, decision persistence,
status mapping, and the ApplicationApproved domain event (FA-F3.10, no M1
subscriber -- published as one structured log line since nothing consumes
it yet, reusing the existing `truelend.*` JSON logging seam rather than
inventing new pub/sub infrastructure).
"""

from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass
from datetime import UTC
from decimal import Decimal
from pathlib import Path
from typing import cast

from truelend.repository import applications_repo, decisions_repo
from truelend.repository.applications_repo import ApplicationRecord
from truelend.service.policy_service import ProductRule, get_catalog_for_version
from truelend.service.scoring import score as compute_score
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import ApplicationStatus, DecisionType, ProductType
from truelend.types.errors import (
    AlreadyDecidedError,
    NotFoundError,
    NotSubmittedError,
    PolicyViolationException,
)
from truelend.types.money import Money

_logger = logging.getLogger("truelend.events")

_STATUS_BY_DECISION: dict[DecisionType, ApplicationStatus] = {
    "AUTO_APPROVE": "APPROVED",
    "AUTO_REJECT": "REJECTED",
    "MANUAL_REVIEW": "MANUAL_REVIEW",
}


@dataclass(frozen=True)
class DecisionResult:
    decision: DecisionType
    score: int
    reason_codes: list[str]


@dataclass(frozen=True)
class UnderwriteResult:
    decision: DecisionType
    score: int
    reason_codes: list[str]
    policy_version: int
    status: ApplicationStatus


class RuleEngine:
    """Pure decision rules over one application (FA-F3.3). No I/O; the same
    inputs always produce the same `DecisionResult`."""

    def evaluate(
        self, *, age_years: int, monthly_income: Decimal, score: int, policy: ProductRule
    ) -> DecisionResult:
        """(1) income floor raises `PolicyViolationException`; (2) age range
        and (3) score floor each may add a reason code -- if either did,
        `AUTO_REJECT` carrying every added code; otherwise `AUTO_APPROVE` at
        the approve threshold, else `MANUAL_REVIEW`."""
        if monthly_income < policy.min_income:
            raise PolicyViolationException(
                f"Monthly income {monthly_income} is below the {policy.product_type}"
                f" minimum of {policy.min_income}."
            )
        codes = self._reject_codes(age_years, score, policy)
        if codes:
            return DecisionResult("AUTO_REJECT", score, codes)
        if policy.auto_approve_min_score is not None and score >= policy.auto_approve_min_score:
            return DecisionResult("AUTO_APPROVE", score, ["SCORE_MEETS_AUTO_APPROVE"])
        return DecisionResult("MANUAL_REVIEW", score, ["SCORE_IN_REVIEW_BAND"])

    @staticmethod
    def _reject_codes(age_years: int, score: int, policy: ProductRule) -> list[str]:
        codes: list[str] = []
        if not (policy.min_age <= age_years <= policy.max_age):
            codes.append("AGE_OUT_OF_RANGE")
        if policy.auto_reject_below_score is not None and score < policy.auto_reject_below_score:
            codes.append("SCORE_BELOW_MIN")
        return codes


def underwrite(
    conn: sqlite3.Connection,
    clock: Clock,
    application_id: int,
    *,
    principal: AuthPrincipal,
    policies_dir: Path,
) -> UnderwriteResult:
    """Underwrite a SUBMITTED application exactly once (FA-F3.5)."""
    record = _load_authorized(conn, application_id, principal)
    if record.status == "DRAFT":
        raise NotSubmittedError()
    if decisions_repo.get_by_application(conn, application_id) is not None:
        raise AlreadyDecidedError()
    assert record.policy_version is not None  # pinned at submit (E2-S3)
    result = _decide(conn, record, policies_dir=policies_dir)
    _persist(conn, clock, application_id, record.policy_version, result)
    return UnderwriteResult(
        decision=result.decision,
        score=result.score,
        reason_codes=result.reason_codes,
        policy_version=record.policy_version,
        status=_STATUS_BY_DECISION[result.decision],
    )


def _load_authorized(
    conn: sqlite3.Connection, application_id: int, principal: AuthPrincipal
) -> ApplicationRecord:
    record = applications_repo.get_by_id(conn, application_id)
    if record is None or (
        principal.role == "CUSTOMER" and record.applicant_user_id != principal.user_id
    ):
        raise NotFoundError("NOT_FOUND", "Application not found.")
    return record


def _decide(
    conn: sqlite3.Connection, record: ApplicationRecord, *, policies_dir: Path
) -> DecisionResult:
    assert record.policy_version is not None
    policy = _rule_for(conn, record.policy_version, record.product_type, policies_dir=policies_dir)
    computed = compute_score(
        record.age_years, cast(Money, record.monthly_income), record.credit_flags
    )
    try:
        return RuleEngine().evaluate(
            age_years=record.age_years,
            monthly_income=record.monthly_income,
            score=computed,
            policy=policy,
        )
    except PolicyViolationException:
        return DecisionResult("AUTO_REJECT", computed, ["INCOME_BELOW_MIN"])


def _rule_for(
    conn: sqlite3.Connection, policy_version: int, product_type: ProductType, *, policies_dir: Path
) -> ProductRule:
    catalog = {
        rule.product_type: rule
        for rule in get_catalog_for_version(conn, policies_dir, policy_version)
    }
    return catalog[product_type]


def _persist(
    conn: sqlite3.Connection,
    clock: Clock,
    application_id: int,
    policy_version: int,
    result: DecisionResult,
) -> None:
    decided_at = clock.now().astimezone(UTC).isoformat()
    decisions_repo.insert(
        conn,
        application_id=application_id,
        decision=result.decision,
        score=result.score,
        reason_codes=result.reason_codes,
        policy_version=policy_version,
        decided_at=decided_at,
    )
    new_status = _STATUS_BY_DECISION[result.decision]
    applications_repo.mark_decided(conn, application_id, new_status)
    conn.commit()
    if new_status == "APPROVED":
        publish_application_approved(application_id)


def publish_application_approved(application_id: int) -> None:
    """In-process domain event, FA-F3.10: M1 has no subscriber, so the one
    observable effect is this structured log line (captured by tests via
    the existing `log_buffer`/`configure_logging` seam, same as access
    logging in `api/middleware.py`)."""
    _logger.info("ApplicationApproved", extra={"fields": {"application_id": application_id}})
