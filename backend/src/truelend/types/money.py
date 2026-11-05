"""Money is always a 2-decimal `Decimal`; never a native float."""

from __future__ import annotations

from decimal import Decimal
from typing import NewType

Money = NewType("Money", Decimal)
