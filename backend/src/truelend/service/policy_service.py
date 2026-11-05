"""Policy catalog service (E2-S1, E4-S1): idempotently seed policy_v0001.json
as APPROVED version 1, re-verify every recorded policy file's checksum and
path confinement on every read (not only at startup), build the active
version's product catalog with `Decimal` money -- never `float` -- and
create/approve new policy versions.
"""

from __future__ import annotations

import copy
import hashlib
import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC
from decimal import Decimal
from pathlib import Path
from typing import Any, cast

from truelend.repository import audit_repo, policy_repo
from truelend.types.contracts import AuthPrincipal, Clock
from truelend.types.enums import DocumentType, ProductType
from truelend.types.errors import (
    ConflictError,
    NotFoundError,
    PolicyChecksumMismatchError,
    PolicyFieldValidationError,
    PolicyPathTraversalError,
)

_SEEDED_POLICY_VERSION = 1
_SEEDED_POLICY_FILENAME = "policy_v0001.json"


@dataclass(frozen=True)
class ProductRule:
    """A product's thresholds and required documents at a policy version."""

    product_type: ProductType
    policy_version: int
    min_age: int
    max_age: int
    min_income: Decimal
    min_tenure_months: int
    max_tenure_months: int
    min_amount: Decimal
    max_amount: Decimal
    annual_rate_pct: Decimal
    auto_reject_below_score: int | None
    auto_approve_min_score: int | None
    required_documents: list[DocumentType]


def _sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def seed_policy_version_one(
    conn: sqlite3.Connection, policies_dir: Path, *, clock: Clock, created_by: int
) -> None:
    """Idempotent: records version 1 as APPROVED with the seed file's hash."""
    file_path = policies_dir / _SEEDED_POLICY_FILENAME
    now = clock.now().astimezone(UTC).isoformat()
    policy_repo.insert_if_absent(
        conn, version=_SEEDED_POLICY_VERSION, status="APPROVED", file_path=str(file_path),
        sha256=_sha256_file(file_path), base_version=None, created_by=created_by,
        created_at=now, approved_by=created_by, approved_at=now,
    )
    conn.commit()


def _confined_path(policies_dir: Path, file_path: str) -> Path:
    """`file_path` resolved (`..`/symlinks followed) and confirmed inside the resolved root."""
    root = policies_dir.resolve()
    candidate = Path(file_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise PolicyPathTraversalError(file_path) from exc
    return candidate


def _verify_file(path: Path, expected_sha256: str, version: int) -> bytes:
    """Hash the one read of `path`'s bytes and return those same bytes, so a
    caller never parses a later, separate read that a swap could tamper
    with between the hash check and the parse."""
    if not path.is_file():
        raise PolicyChecksumMismatchError(version)
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise PolicyChecksumMismatchError(version)
    return content


def _read_verified_json(
    policies_dir: Path, record: policy_repo.PolicyVersionRecord
) -> dict[str, Any]:
    path = _confined_path(policies_dir, record.file_path)
    verified_bytes = _verify_file(path, record.sha256, record.version)
    return cast(dict[str, Any], json.loads(verified_bytes.decode("utf-8")))


def verify_policy_checksums(conn: sqlite3.Connection, policies_dir: Path) -> None:
    """Raise if any recorded file's content no longer matches its hash, or
    its path escapes `policies_dir`."""
    for record in policy_repo.list_versions(conn):
        path = _confined_path(policies_dir, record.file_path)
        _verify_file(path, record.sha256, record.version)


def get_active_catalog(conn: sqlite3.Connection, policies_dir: Path) -> list[ProductRule]:
    """`ProductRule`s for the highest APPROVED version, re-verified on
    every call, not only at startup."""
    active = policy_repo.get_active_version(conn)
    if active is None:
        return []
    content = _read_verified_json(policies_dir, active)
    return [
        _to_product_rule(product_type, body, active.version)
        for product_type, body in content["products"].items()
    ]


def get_policy(conn: sqlite3.Connection, version: int) -> policy_repo.PolicyVersionRecord:
    """A policy version's metadata; `NotFoundError` if unknown (E4-S1)."""
    record = policy_repo.get_by_version(conn, version)
    if record is None:
        raise NotFoundError("NOT_FOUND", f"Policy version {version} not found.")
    return record


def _apply_changes(content: dict[str, Any], changes: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Deep-copy `content`, patch each named product with its partial `changes` dict."""
    merged = copy.deepcopy(content)
    for product_type, patch in changes.items():
        merged["products"][product_type] = {**merged["products"][product_type], **patch}
    return merged


def _write_draft_file(
    conn: sqlite3.Connection, policies_dir: Path, content: dict[str, Any]
) -> tuple[int, str, str]:
    version = policy_repo.next_version(conn)
    file_path = policies_dir / f"policy_v{version:04d}.json"
    file_bytes = json.dumps(content, indent=2).encode("utf-8")
    file_path.write_bytes(file_bytes)
    return version, str(file_path), hashlib.sha256(file_bytes).hexdigest()


def _record_draft(
    conn: sqlite3.Connection,
    clock: Clock,
    *,
    version: int,
    file_path: str,
    sha256: str,
    base_version: int,
    actor: AuthPrincipal,
    correlation_id: str,
) -> None:
    now = clock.now().astimezone(UTC).isoformat()
    policy_repo.insert_draft(
        conn, version=version, file_path=file_path, sha256=sha256, base_version=base_version,
        created_by=actor.user_id, created_at=now,
    )
    audit_repo.insert(
        conn, clock, actor=actor, action="POLICY_CREATED", entity_type="policy_version",
        entity_id=version, correlation_id=correlation_id,
    )
    conn.commit()


def create_policy(
    conn: sqlite3.Connection,
    policies_dir: Path,
    clock: Clock,
    *,
    base_version: int,
    changes: dict[str, dict[str, Any]],
    actor: AuthPrincipal,
    correlation_id: str,
) -> policy_repo.PolicyVersionRecord:
    """Copy `base_version`'s file, apply `changes`, validate, write a new
    DRAFT file only if validation passes (AC1/AC6)."""
    base = policy_repo.get_by_version(conn, base_version)
    if base is None:
        raise NotFoundError("NOT_FOUND", f"Policy version {base_version} not found.")
    merged = _apply_changes(_read_verified_json(policies_dir, base), changes)
    _validate_policy_content(merged)
    version, file_path, sha256 = _write_draft_file(conn, policies_dir, merged)
    _record_draft(
        conn, clock, version=version, file_path=file_path, sha256=sha256,
        base_version=base_version, actor=actor, correlation_id=correlation_id,
    )
    created = policy_repo.get_by_version(conn, version)
    assert created is not None  # just inserted on this same connection
    return created


def approve_policy(
    conn: sqlite3.Connection,
    clock: Clock,
    *,
    version: int,
    actor: AuthPrincipal,
    correlation_id: str,
) -> policy_repo.PolicyVersionRecord:
    """DRAFT -> APPROVED with an audit row (AC3). `NotFoundError` if
    unknown, `ConflictError` if not DRAFT."""
    record = policy_repo.get_by_version(conn, version)
    if record is None:
        raise NotFoundError("NOT_FOUND", f"Policy version {version} not found.")
    now = clock.now().astimezone(UTC).isoformat()
    rowcount = policy_repo.approve(
        conn, version=version, approved_by=actor.user_id, approved_at=now
    )
    if rowcount == 0:
        raise ConflictError("CONFLICT", f"Policy version {version} is not DRAFT.")
    audit_repo.insert(
        conn, clock, actor=actor, action="POLICY_APPROVED", entity_type="policy_version",
        entity_id=version, correlation_id=correlation_id,
    )
    conn.commit()
    approved = policy_repo.get_by_version(conn, version)
    assert approved is not None  # just updated on this same connection
    return approved


def _validate_policy_content(content: dict[str, Any]) -> None:
    """Validate every product in the merged document, not just the ones a
    `changes` patch touched -- catches a corrupt predecessor too."""
    for product_type, body in content["products"].items():
        _validate_product_rule(product_type, body)


def _validate_product_rule(product_type: str, body: dict[str, Any]) -> None:
    _validate_score_band(product_type, body)
    for field in ("min_income", "min_amount", "max_amount", "annual_rate_pct"):
        _require_non_negative(product_type, field, body[field])
    if body["min_age"] > body["max_age"]:
        raise PolicyFieldValidationError(product_type, "min_age", "must not exceed max_age")
    if body["min_tenure_months"] > body["max_tenure_months"]:
        raise PolicyFieldValidationError(
            product_type, "min_tenure_months", "must not exceed max_tenure_months"
        )
    if Decimal(body["min_amount"]) > Decimal(body["max_amount"]):
        raise PolicyFieldValidationError(product_type, "min_amount", "must not exceed max_amount")


def _validate_score_band(product_type: str, body: dict[str, Any]) -> None:
    reject = body.get("auto_reject_below_score")
    approve = body.get("auto_approve_min_score")
    if reject is not None and approve is not None and reject >= approve:
        raise PolicyFieldValidationError(
            product_type, "auto_reject_below_score", "must be less than auto_approve_min_score"
        )


def _require_non_negative(product_type: str, field: str, value: str) -> None:
    if Decimal(value) < 0:
        raise PolicyFieldValidationError(product_type, field, "must not be negative")


def _to_product_rule(product_type: str, body: dict[str, Any], policy_version: int) -> ProductRule:
    return ProductRule(
        product_type=cast(ProductType, product_type),
        policy_version=policy_version,
        min_age=body["min_age"],
        max_age=body["max_age"],
        min_income=Decimal(body["min_income"]),
        min_tenure_months=body["min_tenure_months"],
        max_tenure_months=body["max_tenure_months"],
        min_amount=Decimal(body["min_amount"]),
        max_amount=Decimal(body["max_amount"]),
        annual_rate_pct=Decimal(body["annual_rate_pct"]),
        auto_reject_below_score=body.get("auto_reject_below_score"),
        auto_approve_min_score=body.get("auto_approve_min_score"),
        required_documents=cast(list[DocumentType], body["required_documents"]),
    )
