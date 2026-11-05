"""Shared domain literals. Pure declarations, no business logic (D-C)."""

from __future__ import annotations

from typing import Literal

Role = Literal["CUSTOMER", "UNDERWRITER", "POLICY_EDITOR", "ADMIN"]
ApplicationStatus = Literal["DRAFT", "SUBMITTED", "MANUAL_REVIEW", "APPROVED", "REJECTED"]
DocumentStatus = Literal["MISSING", "UPLOADED", "VERIFIED", "REJECTED"]
DecisionType = Literal["AUTO_APPROVE", "AUTO_REJECT", "MANUAL_REVIEW"]
ResolutionKind = Literal["MANUAL_REVIEW", "OVERRIDE"]
ResolutionOutcome = Literal["APPROVED", "REJECTED"]
PolicyStatus = Literal["DRAFT", "APPROVED"]
ProductType = Literal["PERSONAL", "VEHICLE", "EDUCATION"]
DocumentType = Literal[
    "ID_PROOF",
    "ADDRESS_PROOF",
    "SALARY_SLIP",
    "VEHICLE_QUOTATION",
    "ADMISSION_LETTER",
    "FEE_STRUCTURE",
]
