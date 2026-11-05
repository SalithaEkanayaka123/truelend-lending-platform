import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { PolicyVersion, ProductRule } from '../types/policy';
import type { UsePoliciesResult } from './usePolicies';
import { usePolicyEditor } from './usePolicyEditor';

const base: ProductRule = {
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
  required_documents: [],
};

const created: PolicyVersion = {
  version: 2,
  status: 'DRAFT',
  base_version: 1,
  created_by: 1,
  created_at: 't',
  approved_by: null,
  approved_at: null,
};

function policies(createDraft = vi.fn().mockResolvedValue(created)): UsePoliciesResult {
  return {
    products: [base, { ...base, product_type: 'VEHICLE' }, { ...base, product_type: 'EDUCATION' }],
    versions: [],
    baseVersion: 1,
    loading: false,
    error: null,
    loadError: null,
    reload: vi.fn(),
    createDraft,
  };
}

const submit = { preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>;

describe('usePolicyEditor changeCount', () => {
  it('is 0 until a field differs from the loaded value', async () => {
    const { result } = renderHook(() => usePolicyEditor(policies()));
    await waitFor(() => expect(result.current.edited).not.toBeNull());
    expect(result.current.changeCount).toBe(0);
  });

  it('counts changed fields across products and returns to 0 when reverted', async () => {
    const { result } = renderHook(() => usePolicyEditor(policies()));
    await waitFor(() => expect(result.current.edited).not.toBeNull());

    act(() => result.current.onFieldChange('PERSONAL', { min_age: 22 }));
    act(() => result.current.onFieldChange('VEHICLE', { annual_rate_pct: '11.00' }));
    expect(result.current.changeCount).toBe(2);

    act(() => result.current.onFieldChange('PERSONAL', { min_age: 21 }));
    expect(result.current.changeCount).toBe(1);
  });

  it('resets to 0 after a successful save and counts from the saved values', async () => {
    const createDraft = vi.fn().mockResolvedValue(created);
    const { result } = renderHook(() => usePolicyEditor(policies(createDraft)));
    await waitFor(() => expect(result.current.edited).not.toBeNull());

    act(() => result.current.onFieldChange('PERSONAL', { min_age: 22 }));
    await act(async () => result.current.onSubmit(submit));
    await waitFor(() => expect(result.current.banner).toBe('Draft v2'));
    expect(result.current.changeCount).toBe(0);

    act(() => result.current.onFieldChange('PERSONAL', { min_age: 23 }));
    expect(result.current.changeCount).toBe(1);
  });

  it('keeps the changes when the save fails', async () => {
    const createDraft = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePolicyEditor(policies(createDraft)));
    await waitFor(() => expect(result.current.edited).not.toBeNull());

    act(() => result.current.onFieldChange('PERSONAL', { min_age: 22 }));
    await act(async () => result.current.onSubmit(submit));
    await waitFor(() => expect(result.current.topError).toBe('boom'));
    expect(result.current.changeCount).toBe(1);
  });
});
