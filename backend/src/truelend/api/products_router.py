"""GET /api/products — the active policy's product catalog (E2-S1), open
to any authenticated role."""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from truelend.api.deps import get_app_settings, get_conn, get_current_principal
from truelend.config.money import decimal_to_wire
from truelend.config.settings import Settings
from truelend.service.policy_service import ProductRule, get_active_catalog
from truelend.types.contracts import AuthPrincipal
from truelend.types.enums import DocumentType, ProductType

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductRuleResponse(BaseModel):
    product_type: ProductType
    policy_version: int
    min_age: int
    max_age: int
    min_income: str
    min_tenure_months: int
    max_tenure_months: int
    min_amount: str
    max_amount: str
    annual_rate_pct: str
    auto_reject_below_score: int | None
    auto_approve_min_score: int | None
    required_documents: list[DocumentType]


def _to_response(rule: ProductRule) -> ProductRuleResponse:
    return ProductRuleResponse(
        product_type=rule.product_type,
        policy_version=rule.policy_version,
        min_age=rule.min_age,
        max_age=rule.max_age,
        min_income=decimal_to_wire(rule.min_income),
        min_tenure_months=rule.min_tenure_months,
        max_tenure_months=rule.max_tenure_months,
        min_amount=decimal_to_wire(rule.min_amount),
        max_amount=decimal_to_wire(rule.max_amount),
        annual_rate_pct=decimal_to_wire(rule.annual_rate_pct),
        auto_reject_below_score=rule.auto_reject_below_score,
        auto_approve_min_score=rule.auto_approve_min_score,
        required_documents=rule.required_documents,
    )


@router.get("", response_model=list[ProductRuleResponse])
def list_products_route(
    conn: sqlite3.Connection = Depends(get_conn),
    settings: Settings = Depends(get_app_settings),
    principal: AuthPrincipal = Depends(get_current_principal),
) -> list[ProductRuleResponse]:
    del principal  # guard only; the catalog is the same for every role
    return [_to_response(rule) for rule in get_active_catalog(conn, settings.policies_dir)]
