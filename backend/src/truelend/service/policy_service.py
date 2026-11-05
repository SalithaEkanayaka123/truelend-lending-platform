"""Policy catalog service (E2-S1): idempotently seed the policy_v0001.json
file as the APPROVED version 1, verify every recorded policy file's
checksum on every startup, and build the active version's product catalog
with `Decimal` money (D-F) — never `float`.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC
from decimal import Decimal
from pathlib import Path
from typing import Any, cast

from truelend.repository import policy_repo
from truelend.types.contracts import Clock
from truelend.types.enums import DocumentType, ProductType
from truelend.types.errors import PolicyChecksumMismatchError

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
    """Idempotent: record version 1 as `APPROVED` with the seed file's
    SHA-256, so startup never overwrites a previously-recorded hash."""
    file_path = policies_dir / _SEEDED_POLICY_FILENAME
    now = clock.now().astimezone(UTC).isoformat()
    policy_repo.insert_if_absent(
        conn,
        version=_SEEDED_POLICY_VERSION,
        status="APPROVED",
        file_path=str(file_path),
        sha256=_sha256_file(file_path),
        base_version=None,
        created_by=created_by,
        created_at=now,
        approved_by=created_by,
        approved_at=now,
    )
    conn.commit()


def verify_policy_checksums(conn: sqlite3.Connection) -> None:
    """Abort with `PolicyChecksumMismatchError` if any recorded policy
    file's current content no longer matches its stored hash."""
    for record in policy_repo.list_versions(conn):
        path = Path(record.file_path)
        if not path.is_file() or _sha256_file(path) != record.sha256:
            raise PolicyChecksumMismatchError(record.version)


def get_active_catalog(conn: sqlite3.Connection) -> list[ProductRule]:
    """The `ProductRule`s for the highest-numbered `APPROVED` version, or
    an empty list if no version has been approved yet."""
    active = policy_repo.get_active_version(conn)
    if active is None:
        return []
    content = json.loads(Path(active.file_path).read_text(encoding="utf-8"))
    return [
        _to_product_rule(product_type, body, active.version)
        for product_type, body in content["products"].items()
    ]


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
