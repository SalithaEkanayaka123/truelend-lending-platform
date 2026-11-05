"""Protocol declarations and pure value types shared across layers (D-C).

No business logic here — only structural interfaces (`Protocol`) and frozen
dataclasses. `Clock` is declared here (rather than in `config`) because it is
a `types`-layer seam: `service` and `api` code depends on the Protocol, never
on a concrete clock.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from truelend.types.enums import Role
from truelend.types.money import Money


class Clock(Protocol):
    """Injectable source of the current time."""

    def now(self) -> datetime: ...


class AuthPrincipal(Protocol):
    """The authenticated actor making a request."""

    user_id: int
    role: Role
    email: str


class AuditWriter(Protocol):
    """Appends an audit entry in the caller's own transaction."""

    def write(
        self,
        *,
        actor: AuthPrincipal,
        action: str,
        entity_type: str,
        entity_id: int,
        correlation_id: str,
        reason_code: str | None = None,
        comment: str | None = None,
        before: dict[str, object] | None = None,
        after: dict[str, object] | None = None,
    ) -> None: ...


@dataclass(frozen=True)
class CreditFlags:
    """Credit-bureau-style flags consumed by `ScoreFunction`."""

    prior_default: bool
    missed_payment_12m: bool
    thin_file: bool


class ScoreFunction(Protocol):
    """Pure credit-scoring function (implemented by `service.scoring.score`)."""

    def __call__(self, age_years: int, monthly_income: Money, flags: CreditFlags) -> int: ...


@dataclass(frozen=True)
class ApplicationApproved:
    """In-process domain event published on approval. No M1 subscriber."""

    application_id: int
