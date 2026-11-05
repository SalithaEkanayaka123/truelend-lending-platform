"""E3-S2: credit-scoring stub (VM-043..VM-047)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from truelend.service.scoring import score

from truelend.types.contracts import CreditFlags

NONE = CreditFlags(prior_default=False, missed_payment_12m=False, thin_file=False)


def d(v: str) -> Decimal:
    return Decimal(v)


def test_e3_s2_ac1_age40_income100k_scores_740() -> None:
    assert score(40, d("100000.00"), NONE) == 740


def test_e3_s2_ac2_baseline_and_default_penalty() -> None:
    assert score(30, d("60000.00"), NONE) == 680
    flags = CreditFlags(prior_default=True, missed_payment_12m=False, thin_file=False)
    assert score(30, d("30000.00"), flags) == 500


def test_e3_s2_ac3_deterministic_100_runs() -> None:
    scores = {score(30, d("60000.00"), NONE) for _ in range(100)}
    assert scores == {680}


def test_e3_s2_ac4_one_input_at_a_time_from_680() -> None:
    assert score(40, d("60000.00"), NONE) == 700
    assert score(30, d("70000.00"), NONE) == 690
    assert score(30, d("60000.00"), CreditFlags(False, True, False)) == 620
    assert score(30, d("60000.00"), CreditFlags(False, False, True)) == 640
    assert score(30, d("60000.00"), CreditFlags(True, False, False)) == 530


def test_e3_s2_ac5_bounds_and_income_cap() -> None:
    assert score(18, d("0.00"), CreditFlags(True, True, True)) == 350
    assert score(40, d("150000.00"), NONE) == 790
    assert score(40, d("500000.00"), NONE) == 790


@pytest.mark.parametrize(
    ("age", "points"),
    [(18, 0), (25, 0), (26, 20), (35, 20), (36, 40), (50, 40), (51, 30), (65, 30), (66, 0)],
)
def test_e3_s2_age_band_boundaries(age: int, points: int) -> None:
    assert score(age, d("0.00"), NONE) == 600 + points


def test_e3_s2_income_step_is_per_10000_floor() -> None:
    assert score(18, d("9999.99"), NONE) == 600
    assert score(18, d("10000.00"), NONE) == 610


def test_e3_s2_rejects_float_income() -> None:
    with pytest.raises(TypeError):
        score(30, 60000.0, NONE)  # type: ignore[arg-type]
