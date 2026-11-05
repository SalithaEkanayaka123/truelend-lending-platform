"""Typed domain errors. Each maps 1:1 to an error-envelope `code` at the API
boundary (see `truelend.config.errors`).
"""

from __future__ import annotations


class DomainError(Exception):
    """Base domain error. `code` is the machine-readable error-envelope code."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class ValidationError(DomainError):
    """Input failed a domain validation rule -> 422."""


class NotFoundError(DomainError):
    """Referenced entity does not exist (or is not visible to the actor) -> 404."""


class ForbiddenError(DomainError):
    """Actor is authenticated but not permitted to perform the action -> 403."""


class ConflictError(DomainError):
    """Action is not valid for the entity's current state -> 409."""


class PolicyViolationException(DomainError):
    """Application fails a policy rule during underwriting. Code is fixed in M1."""

    def __init__(self, message: str) -> None:
        super().__init__("INCOME_BELOW_MIN", message)


class MigrationChecksumMismatchError(DomainError):
    """A previously-applied migration file was edited or deleted on disk."""

    def __init__(self, filename: str) -> None:
        super().__init__(
            "MIGRATION_CHECKSUM_MISMATCH",
            f"Migration checksum mismatch for '{filename}': file was edited or removed "
            "after it was applied.",
        )
        self.filename = filename


class PolicyChecksumMismatchError(DomainError):
    """A policy file recorded in `policy_versions` was edited or removed
    after it was approved."""

    def __init__(self, version: int) -> None:
        super().__init__(
            "POLICY_CHECKSUM_MISMATCH",
            f"Policy checksum mismatch for version {version}: file was edited or removed "
            "after it was approved.",
        )
        self.version = version
