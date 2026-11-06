import type { ProductRule } from '../types/policy';

/** Error message keyed by the `ProductRule` field it should render beside. */
export type FieldErrors = Partial<Record<keyof ProductRule, string>>;

/** Exact fixed-point comparison for 2-decimal money strings: parses into
 * integer minor units (paise) via string manipulation only — never
 * `Number`/`parseFloat` — so comparison can never be a float-rounding bug. */
export function moneyToMinorUnits(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ''] = unsigned.split('.');
  const paddedFraction = (fraction + '00').slice(0, 2);
  const minorUnits = BigInt(`${whole || '0'}${paddedFraction}`);
  return negative ? -minorUnits : minorUnits;
}

/** Mirrors the FA-F1.6 cross-field threshold rules `policy_service.py`
 * enforces server-side, for inline feedback only — the backend's response is
 * always the authority (E4-S2-AC2). */
export function validateProductRule(rule: ProductRule): FieldErrors {
  const errors: FieldErrors = {};

  if (!(rule.min_age < rule.max_age)) {
    errors.max_age = 'Min age must be less than max age.';
  }
  if (!(rule.min_tenure_months <= rule.max_tenure_months)) {
    errors.max_tenure_months = 'Min tenure must be less than or equal to max tenure.';
  }
  if (!(moneyToMinorUnits(rule.min_amount) <= moneyToMinorUnits(rule.max_amount))) {
    errors.max_amount = 'Min amount must be less than or equal to max amount.';
  }
  if (
    rule.auto_reject_below_score !== null &&
    rule.auto_approve_min_score !== null &&
    !(rule.auto_reject_below_score < rule.auto_approve_min_score)
  ) {
    errors.auto_approve_min_score = 'Auto-reject threshold must be below auto-approve threshold.';
  }

  return errors;
}

export function hasFieldErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
