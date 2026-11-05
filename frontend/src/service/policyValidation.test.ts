import { describe, expect, it } from 'vitest';

import type { ProductRule } from '../types/policy';
import { hasFieldErrors, validateProductRule } from './policyValidation';

const basePersonalRule: ProductRule = {
  product_type: 'PERSONAL',
  policy_version: 1,
  min_age: 21,
  max_age: 60,
  min_income: '25000.00',
  min_tenure_months: 12,
  max_tenure_months: 60,
  min_amount: '50000.00',
  max_amount: '1500000.00',
  annual_rate_pct: '12.00',
  auto_reject_below_score: 600,
  auto_approve_min_score: 700,
  required_documents: ['ID_PROOF', 'ADDRESS_PROOF', 'SALARY_SLIP'],
};

describe('validateProductRule', () => {
  it('returns no errors for a valid product rule', () => {
    const errors = validateProductRule(basePersonalRule);
    expect(errors).toEqual({});
    expect(hasFieldErrors(errors)).toBe(false);
  });

  it('flags max_age when min_age is not less than max_age (E4-S2-AC2)', () => {
    const rule: ProductRule = { ...basePersonalRule, min_age: 70, max_age: 60 };
    const errors = validateProductRule(rule);
    expect(errors.max_age).toBe('Min age must be less than max age.');
    expect(hasFieldErrors(errors)).toBe(true);
  });

  it('flags max_tenure_months when min tenure exceeds max tenure', () => {
    const rule: ProductRule = { ...basePersonalRule, min_tenure_months: 72, max_tenure_months: 60 };
    expect(validateProductRule(rule).max_tenure_months).toBe(
      'Min tenure must be less than or equal to max tenure.',
    );
  });

  it('allows min_tenure_months equal to max_tenure_months', () => {
    const rule: ProductRule = { ...basePersonalRule, min_tenure_months: 60, max_tenure_months: 60 };
    expect(validateProductRule(rule).max_tenure_months).toBeUndefined();
  });

  it('flags max_amount using exact fixed-point comparison, not float rounding', () => {
    const rule: ProductRule = { ...basePersonalRule, min_amount: '1500000.01', max_amount: '1500000.00' };
    expect(validateProductRule(rule).max_amount).toBe(
      'Min amount must be less than or equal to max amount.',
    );
  });

  it('allows min_amount equal to max_amount', () => {
    const rule: ProductRule = { ...basePersonalRule, min_amount: '50000.00', max_amount: '50000.00' };
    expect(validateProductRule(rule).max_amount).toBeUndefined();
  });

  it('flags auto_approve_min_score when reject threshold is not below approve threshold', () => {
    const rule: ProductRule = {
      ...basePersonalRule,
      auto_reject_below_score: 700,
      auto_approve_min_score: 700,
    };
    expect(validateProductRule(rule).auto_approve_min_score).toBe(
      'Auto-reject threshold must be below auto-approve threshold.',
    );
  });

  it('does not require score thresholds when either is absent', () => {
    const rule: ProductRule = {
      ...basePersonalRule,
      auto_reject_below_score: null,
      auto_approve_min_score: null,
    };
    expect(validateProductRule(rule).auto_approve_min_score).toBeUndefined();
  });
});
