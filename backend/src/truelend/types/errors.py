"""Typed domain errors. Each maps 1:1 to an error-envelope `code` at the API
boundary (see `truelend.config.errors`).
"""

from __future__ import annotations

from collections.abc import Sequence


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


class TenureOutOfRangeError(ValidationError):
    """Requested tenure (months) is outside the product's policy range -> 422."""

    def __init__(self, message: str) -> None:
        super().__init__("TENURE_OUT_OF_RANGE", message)


class AmountOutOfRangeError(ValidationError):
    """Requested amount is outside the product's policy range -> 422."""

    def __init__(self, message: str) -> None:
        super().__init__("AMOUNT_OUT_OF_RANGE", message)


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


class PolicyFieldValidationError(ValidationError):
    """A policy `changes` patch fails a domain validation rule (rate/age/
    tenure/amount/score range) -> 422, naming the offending product type and
    field (E4-S1-AC6)."""

    def __init__(self, product_type: str, field: str, message: str) -> None:
        super().__init__("VALIDATION_ERROR", f"{product_type}.{field}: {message}")
        self.product_type = product_type
        self.field = field


class DocumentTypeNotRequiredError(ValidationError):
    """Uploaded `type` is not on this application's checklist -> 422
    (E2-S3-AC2)."""

    def __init__(self, document_type: str) -> None:
        super().__init__(
            "DOCUMENT_TYPE_NOT_REQUIRED",
            f"{document_type} is not required for this application.",
        )
        self.document_type = document_type


class AlreadySubmittedError(ConflictError):
    """`submit` called a second time (application is not DRAFT) -> 409
    (E2-S3-AC5)."""

    def __init__(self) -> None:
        super().__init__("ALREADY_SUBMITTED", "This application has already been submitted.")


class NotSubmittedError(ConflictError):
    """`underwrite` called before the application is SUBMITTED -> 409 (E3-S3-AC6)."""

    def __init__(self) -> None:
        super().__init__("NOT_SUBMITTED", "This application has not been submitted yet.")


class AlreadyDecidedError(ConflictError):
    """`underwrite` called a second time; the stored decision is unchanged -> 409 (E3-S3-AC6)."""

    def __init__(self) -> None:
        super().__init__("ALREADY_DECIDED", "This application has already been underwritten.")


class MissingDocumentsError(ConflictError):
    """Not every required document is UPLOADED or later -> 409, naming the
    missing types; status stays DRAFT (E2-S3-AC3)."""

    def __init__(self, missing: Sequence[str]) -> None:
        super().__init__(
            "MISSING_DOCUMENTS", "Upload the documents marked Missing, then submit again."
        )
        self.missing = list(missing)


class AlreadyVerifiedError(ConflictError):
    """The document is already VERIFIED (final) -> 409 (E3-S1-AC5)."""

    def __init__(self) -> None:
        super().__init__("ALREADY_VERIFIED", "This document has already been verified.")


class PolicyPathTraversalError(DomainError):
    """A `policy_versions` row's `file_path` does not resolve inside the
    configured policies directory (`..` escape or a symlink pointing
    outside it) -> treated as a server-side integrity failure, not a client
    mistake (E4-S1)."""

    def __init__(self, file_path: str) -> None:
        super().__init__(
            "POLICY_PATH_TRAVERSAL",
            f"Policy file path '{file_path}' does not resolve inside the policies directory.",
        )
        self.file_path = file_path


class NotInReviewError(ConflictError):
    """`review` called on an application that is not in MANUAL_REVIEW -> 409 (E3-S5)."""

    def __init__(self) -> None:
        super().__init__("NOT_IN_REVIEW", "This application is not awaiting manual review.")


class NotOverridableError(ConflictError):
    """`override` called on anything but an unresolved AUTO_REJECT -> 409 (E3-S5)."""

    def __init__(self) -> None:
        super().__init__("NOT_OVERRIDABLE", "Only an auto-rejected application can be overridden.")


class NotDecidedError(NotFoundError):
    """No decision exists yet for the application -> 404 (E3-S5)."""

    def __init__(self) -> None:
        super().__init__("NOT_DECIDED", "This application has not been underwritten yet.")
