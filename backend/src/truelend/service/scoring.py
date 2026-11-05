"""E3-S2: pure credit-scoring stub (FA-F3.2). No I/O, no AI, Decimal only."""

from __future__ import annotations

from decimal import Decimal

from truelend.types.contracts import CreditFlags
from truelend.types.money import Money

_INCOME_STEP = Decimal("10000")
_INCOME_POINTS_CAP = 150


def score(age_years: int, monthly_income: Money, flags: CreditFlags) -> int:
    """Score = 600 + age points + income points - flag penalties (FA-F3.2)."""
    if not isinstance(monthly_income, Decimal):
        raise TypeError("monthly_income must be a Decimal, never a float")
    return (
        600
        + _age_points(age_years)
        + _income_points(monthly_income)
        - _flag_penalty(flags)
    )


def _age_points(age_years: int) -> int:
    if 26 <= age_years <= 35:
        return 20
    if 36 <= age_years <= 50:
        return 40
    if 51 <= age_years <= 65:
        return 30
    return 0


def _income_points(monthly_income: Decimal) -> int:
    steps = int(monthly_income // _INCOME_STEP)
    return min(_INCOME_POINTS_CAP, steps * 10)


def _flag_penalty(flags: CreditFlags) -> int:
    penalty = 0
    if flags.prior_default:
        penalty += 150
    if flags.missed_payment_12m:
        penalty += 60
    if flags.thin_file:
        penalty += 40
    return penalty
