import { describe, expect, it } from 'vitest';

import type { ProductRule } from '../types/policy';
import { buildChangesPayload, diffProductRule } from './policyChanges';

const personal: ProductRule = {
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

const vehicle: ProductRule = { ...personal, product_type: 'VEHICLE', min_age: 21, max_age: 65 };

describe('diffProductRule', () => {
  it('returns an empty patch when nothing changed', () => {
    expect(diffProductRule(personal, { ...personal })).toEqual({});
  });

  it('includes only the fields that changed', () => {
    const edited: ProductRule = { ...personal, min_age: 25, min_income: '30000.00' };
    expect(diffProductRule(personal, edited)).toEqual({ min_age: 25, min_income: '30000.00' });
  });

  it('never includes required_documents (read-only in this screen)', () => {
    const edited: ProductRule = { ...personal, required_documents: ['ID_PROOF'] };
    expect(diffProductRule(personal, edited)).toEqual({});
  });
});

describe('buildChangesPayload', () => {
  it('omits a product entirely when its diff is empty', () => {
    const originals = { PERSONAL: personal, VEHICLE: vehicle, EDUCATION: vehicle };
    const edited = { PERSONAL: { ...personal, min_age: 25 }, VEHICLE: { ...vehicle }, EDUCATION: { ...vehicle } };
    expect(buildChangesPayload(originals, edited)).toEqual({ PERSONAL: { min_age: 25 } });
  });

  it('returns an empty object when nothing changed anywhere', () => {
    const originals = { PERSONAL: personal, VEHICLE: vehicle, EDUCATION: vehicle };
    const edited = { PERSONAL: { ...personal }, VEHICLE: { ...vehicle }, EDUCATION: { ...vehicle } };
    expect(buildChangesPayload(originals, edited)).toEqual({});
  });
});
