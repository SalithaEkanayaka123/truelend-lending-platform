/** Pure diff helpers that turn the editor's in-memory state into the
 * `POST /api/policies` request body (E4-S2-AC3). Keeps `PolicyEditorPage`
 * thin: it never builds the payload itself. */

import type { CreatePolicyRequest, EditableProductField, ProductChangePatch, ProductRule, ProductType } from '../types/policy';

const EDITABLE_FIELDS: readonly EditableProductField[] = [
  'min_age',
  'max_age',
  'min_income',
  'min_tenure_months',
  'max_tenure_months',
  'min_amount',
  'max_amount',
  'annual_rate_pct',
  'auto_reject_below_score',
  'auto_approve_min_score',
];

/** Only the editable fields that differ between `original` and `edited`. */
export function diffProductRule(original: ProductRule, edited: ProductRule): ProductChangePatch {
  const patch: ProductChangePatch = {};
  for (const field of EDITABLE_FIELDS) {
    if (original[field] !== edited[field]) {
      (patch as Record<EditableProductField, unknown>)[field] = edited[field];
    }
  }
  return patch;
}

/** The `changes` body for `POST /api/policies`: only a product key whose
 * diff is non-empty is included. */
export function buildChangesPayload(
  originals: Record<ProductType, ProductRule>,
  edited: Record<ProductType, ProductRule>,
): CreatePolicyRequest['changes'] {
  const changes: CreatePolicyRequest['changes'] = {};
  for (const productType of Object.keys(originals) as ProductType[]) {
    const patch = diffProductRule(originals[productType], edited[productType]);
    if (Object.keys(patch).length > 0) {
      changes[productType] = patch;
    }
  }
  return changes;
}
