import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../repository/apiClient';
import * as applyRepo from '../repository/applyRepo';
import * as policiesRepo from '../repository/policiesRepo';
import { readApplicationIds } from '../repository/applicationIdsStore';
import type { ProductRule } from '../types/policy';
import type { ApplicationDetail } from '../types/review';
import { useApplyWizard } from './useApplyWizard';

vi.mock('../repository/applyRepo');
vi.mock('../repository/policiesRepo');

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

const APP: ApplicationDetail = {
  id: 9,
  product_type: 'PERSONAL',
  requested_amount: '200000.00',
  tenure_months: 24,
  age_years: 30,
  monthly_income: '60000.00',
  pan_masked: '******234F',
  aadhaar_masked: '********9012',
  status: 'DRAFT',
  policy_version: null,
  required_documents: [{ document_id: 1, type: 'ID_PROOF', status: 'MISSING', filename: null, reason: null }],
};

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.mocked(policiesRepo.listProducts).mockResolvedValue([RULE]);
});
afterEach(() => vi.resetAllMocks());

async function toDetails() {
  const hook = renderHook(() => useApplyWizard());
  await waitFor(() => expect(hook.result.current.products.data).not.toBeNull());
  act(() => hook.result.current.selectProduct('PERSONAL'));
  await act(async () => hook.result.current.next());
  return hook;
}

describe('useApplyWizard', () => {
  it('moves Product -> Details and blocks Continue until the form is valid (E2-S4-AC1)', async () => {
    const { result } = await toDetails();
    expect(result.current.step).toBe(1);
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.details.setField('tenure', '72'));
    expect(result.current.details.visibleErrors.tenure).toContain('12-60 months');
  });

  it('creates the draft on Continue, remembers its id and reaches Documents', async () => {
    vi.mocked(applyRepo.createApplication).mockResolvedValue(APP);
    const { result } = await toDetails();
    const fields = { amount: '200000', tenure: '24', age: '30', income: '60000', pan: 'ABCDE1234F', aadhaar: '123456789012' };
    for (const [key, value] of Object.entries(fields)) {
      act(() => result.current.details.setField(key as keyof typeof fields, value));
    }
    expect(result.current.canContinue).toBe(true);
    await act(async () => result.current.next());
    expect(result.current.step).toBe(2);
    expect(readApplicationIds()).toEqual([9]);
  });

  it('highlights missing rows on a 409 MISSING_DOCUMENTS and does not return an id', async () => {
    vi.mocked(applyRepo.createApplication).mockResolvedValue(APP);
    vi.mocked(applyRepo.submitApplication).mockRejectedValue(new ApiError('MISSING_DOCUMENTS', 'Upload first.'));
    const { result } = await toDetails();
    for (const [k, v] of Object.entries({ amount: '200000', tenure: '24', age: '30', income: '60000', pan: 'ABCDE1234F', aadhaar: '123456789012' })) {
      act(() => result.current.details.setField(k as 'amount', v));
    }
    await act(async () => result.current.next());
    let id: number | null = 0;
    await act(async () => {
      id = await result.current.draft.submit();
    });
    expect(id).toBeNull();
    expect(result.current.draft.highlightMissing).toBe(true);
  });
});
