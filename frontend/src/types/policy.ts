/** Policy catalog and policy-version types (E4-S1/E4-S2). Money and rate
 * fields are strings end to end — never parsed into `Number` for display or
 * arithmetic (NFR-01). */

export type ProductType = 'PERSONAL' | 'VEHICLE' | 'EDUCATION';

export const PRODUCT_TYPES: readonly ProductType[] = ['PERSONAL', 'VEHICLE', 'EDUCATION'];

export type DocumentType =
  | 'ID_PROOF'
  | 'ADDRESS_PROOF'
  | 'SALARY_SLIP'
  | 'VEHICLE_QUOTATION'
  | 'ADMISSION_LETTER'
  | 'FEE_STRUCTURE';

/** Matches `truelend.api.products_router.ProductRuleResponse` exactly. */
export interface ProductRule {
  product_type: ProductType;
  policy_version: number;
  min_age: number;
  max_age: number;
  min_income: string;
  min_tenure_months: number;
  max_tenure_months: number;
  min_amount: string;
  max_amount: string;
  annual_rate_pct: string;
  auto_reject_below_score: number | null;
  auto_approve_min_score: number | null;
  required_documents: DocumentType[];
}

/** The subset of `ProductRule` fields a POLICY_EDITOR may change (mirrors
 * `ProductChangeBody` in `policies_router.py`; `required_documents` is
 * read-only in this screen). */
export type EditableProductField =
  | 'min_age'
  | 'max_age'
  | 'min_income'
  | 'min_tenure_months'
  | 'max_tenure_months'
  | 'min_amount'
  | 'max_amount'
  | 'annual_rate_pct'
  | 'auto_reject_below_score'
  | 'auto_approve_min_score';

export type ProductChangePatch = Partial<Pick<ProductRule, EditableProductField>>;

/** Matches `truelend.api.policies_router.PolicyVersionResponse`. `sha256` is
 * part of the documented `PolicyVersion` schema but the running backend does
 * not currently return it on create/list, so it is optional here rather than
 * assumed present. */
export interface PolicyVersion {
  version: number;
  status: 'DRAFT' | 'APPROVED';
  sha256?: string;
  base_version: number | null;
  created_by: number;
  created_at: string;
  approved_by: number | null;
  approved_at: string | null;
}

export interface PolicyVersionPage {
  items: PolicyVersion[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreatePolicyRequest {
  base_version: number;
  changes: Partial<Record<ProductType, ProductChangePatch>>;
}
