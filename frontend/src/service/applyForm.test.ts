import { describe, expect, it } from 'vitest';

import type { ProductRule } from '../types/policy';
import { EMPTY_DETAILS, toRequest, toWireMoney, validateDetails, type DetailsForm } from './applyForm';

const RULE: ProductRule = {
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
  required_documents: ['ID_PROOF'],
};

const VALID: DetailsForm = {
  ...EMPTY_DETAILS,
  amount: '200000',
  tenure: '24',
  age: '30',
  income: '60000',
  pan: 'ABCDE1234F',
  aadhaar: '123456789012',
};

describe('validateDetails', () => {
  it('accepts a complete valid form', () => {
    expect(validateDetails(VALID, RULE)).toEqual({});
  });

  it('shows the 12-60 months range for tenure 72 on PERSONAL (E2-S4-AC2)', () => {
    const errors = validateDetails({ ...VALID, tenure: '72' }, RULE);
    expect(errors.tenure).toContain('12-60 months');
  });

  it('checks amount against the range using exact paise', () => {
    expect(validateDetails({ ...VALID, amount: '49999.99' }, RULE).amount).toBeDefined();
    expect(validateDetails({ ...VALID, amount: '50000.00' }, RULE).amount).toBeUndefined();
  });

  it('flags malformed PAN and Aadhaar and empty fields', () => {
    const errors = validateDetails({ ...EMPTY_DETAILS }, RULE);
    expect(Object.keys(errors).sort()).toEqual(['aadhaar', 'age', 'amount', 'income', 'pan', 'tenure']);
    expect(validateDetails({ ...VALID, pan: 'abc' }, RULE).pan).toBeDefined();
  });
});

describe('request building', () => {
  it('pads money to two decimals without Number', () => {
    expect(toWireMoney('50000')).toBe('50000.00');
    expect(toWireMoney('50000.5')).toBe('50000.50');
  });

  it('builds the wire request', () => {
    const request = toRequest({ ...VALID, thinFile: true }, RULE);
    expect(request).toMatchObject({
      product_type: 'PERSONAL',
      requested_amount: '200000.00',
      tenure_months: 24,
      monthly_income: '60000.00',
      credit_flags: { prior_default: false, missed_payment_12m: false, thin_file: true },
    });
  });
});
