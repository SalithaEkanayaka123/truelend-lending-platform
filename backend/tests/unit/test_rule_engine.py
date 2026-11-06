"""Pure `RuleEngine.evaluate` branch coverage (E3-S3; VM-048/VM-051 unit
layer). FA-F3.3 order: income floor (raises `PolicyViolationException`),
then age range and score floor (either adds a reason code -> AUTO_REJECT),
else the approve/review score bands."""

from __future__ import annotations

from decimal import Decimal

import pytest

from truelend.service.policy_service import ProductRule
from truelend.service.underwriting_service import RuleEngine
from truelend.types.errors import PolicyViolationException

_PERSONAL = ProductRule(
    product_type="PERSONAL",
    policy_version=1,
    min_age=21,
    max_age=60,
    min_income=Decimal("25000.00"),
    min_tenure_months=12,
    max_tenure_months=60,
    min_amount=Decimal("50000.00"),
    max_amount=Decimal("1500000.00"),
    annual_rate_pct=Decimal("12.00"),
    auto_reject_below_score=600,
    auto_approve_min_score=700,
    required_documents=["ID_PROOF", "ADDRESS_PROOF", "SALARY_SLIP"],
)


# tags: E3-S3-AC1
def test_e3_s3_ac1_score_meets_auto_approve_threshold() -> None:
    result = RuleEngine().evaluate(
        age_years=40, monthly_income=Decimal("100000.00"), score=740, policy=_PERSONAL
    )
    assert result.decision == "AUTO_APPROVE"
    assert result.reason_codes == ["SCORE_MEETS_AUTO_APPROVE"]


def test_e3_s3_ac2_score_in_review_band() -> None:
    result = RuleEngine().evaluate(
        age_years=30, monthly_income=Decimal("60000.00"), score=680, policy=_PERSONAL
    )
    assert result.decision == "MANUAL_REVIEW"
    assert result.reason_codes == ["SCORE_IN_REVIEW_BAND"]


def test_e3_s3_ac3_score_below_auto_reject_floor() -> None:
    result = RuleEngine().evaluate(
        age_years=30, monthly_income=Decimal("30000.00"), score=500, policy=_PERSONAL
    )
    assert result.decision == "AUTO_REJECT"
    assert result.reason_codes == ["SCORE_BELOW_MIN"]


# tags: E3-S3-AC4
def test_e3_s3_ac4_age_out_of_range_rejects_with_only_that_code() -> None:
    result = RuleEngine().evaluate(
        age_years=70, monthly_income=Decimal("100000.00"), score=700, policy=_PERSONAL
    )
    assert result.decision == "AUTO_REJECT"
    assert result.reason_codes == ["AGE_OUT_OF_RANGE"]


def test_income_below_minimum_raises_policy_violation() -> None:
    with pytest.raises(PolicyViolationException) as exc:
        RuleEngine().evaluate(
            age_years=30, monthly_income=Decimal("24999.99"), score=640, policy=_PERSONAL
        )
    assert exc.value.code == "INCOME_BELOW_MIN"


def test_income_at_minimum_does_not_raise_and_still_decides() -> None:
    result = RuleEngine().evaluate(
        age_years=30, monthly_income=Decimal("25000.00"), score=640, policy=_PERSONAL
    )
    assert result.decision == "MANUAL_REVIEW"
    assert result.reason_codes == ["SCORE_IN_REVIEW_BAND"]
