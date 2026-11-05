"""Decimal/paise conversion helpers. Never a native numeric type."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

_CENTS = Decimal(100)
_TWO_PLACES = Decimal("0.01")


def paise_to_decimal(paise: int) -> Decimal:
    return (Decimal(paise) / _CENTS).quantize(_TWO_PLACES)


def decimal_to_paise(value: Decimal) -> int:
    return int((value * _CENTS).to_integral_value(rounding=ROUND_HALF_UP))


def decimal_to_wire(value: Decimal) -> str:
    return str(value.quantize(_TWO_PLACES))
