import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../repository/apiClient';
import type { PolicyVersion, ProductRule } from '../types/policy';
import type { UsePoliciesResult } from './usePolicies';
import { usePolicyEditor } from './usePolicyEditor';

function rule(overrides: Partial<ProductRule> = {}): ProductRule {
  return {
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
    ...overrides,
  };
}

function products(): ProductRule[] {
  return [
    rule({ product_type: 'PERSONAL' }),
    rule({ product_type: 'VEHICLE' }),
    rule({ product_type: 'EDUCATION' }),
  ];
}

function policiesFixture(overrides: Partial<UsePoliciesResult> = {}): UsePoliciesResult {
  return {
    products: products(),
    versions: [],
    baseVersion: 1,
    loading: false,
    error: null,
    loadError: null,
    reload: vi.fn(),
    createDraft: vi.fn(),
    ...overrides,
  };
}

describe('usePolicyEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seeds one editable rule per product from the loaded catalog', async () => {
    const { result } = renderHook(() => usePolicyEditor(policiesFixture()));
    await waitFor(() => expect(result.current.edited).not.toBeNull());
    expect(result.current.edited?.PERSONAL.min_age).toBe(21);
    expect(result.current.anyInvalid).toBe(false);
  });

  it('marks anyInvalid and surfaces a field error when min_age >= max_age (E4-S2-AC2)', async () => {
    const { result } = renderHook(() => usePolicyEditor(policiesFixture()));
    await waitFor(() => expect(result.current.edited).not.toBeNull());

    act(() => {
      result.current.onFieldChange('PERSONAL', { min_age: 70 });
    });
    act(() => {
      result.current.onFieldChange('PERSONAL', { max_age: 60 });
    });

    expect(result.current.anyInvalid).toBe(true);
    expect(result.current.errorsFor('PERSONAL').max_age).toMatch(/min age must be less than max age/i);
  });

  it('shows a Draft v{N} banner and clears server errors after a successful save (E4-S2-AC3)', async () => {
    const created: PolicyVersion = {
      version: 2,
      status: 'DRAFT',
      base_version: 1,
      created_by: 1,
      created_at: '2026-01-01T00:00:00Z',
      approved_by: null,
      approved_at: null,
    };
    const createDraft = vi.fn().mockResolvedValue(created);
    const { result } = renderHook(() => usePolicyEditor(policiesFixture({ createDraft })));
    await waitFor(() => expect(result.current.edited).not.toBeNull());

    await act(async () => {
      result.current.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>);
    });

    await waitFor(() => expect(result.current.banner).toBe('Draft v2'));
    expect(createDraft).toHaveBeenCalledTimes(1);
  });

  it('maps a 422 VALIDATION_ERROR onto the named product field (E4-S2-AC2)', async () => {
    const createDraft = vi
      .fn()
      .mockRejectedValue(new ApiError('VALIDATION_ERROR', 'PERSONAL.max_age: Min age must be less than max age.'));
    const { result } = renderHook(() => usePolicyEditor(policiesFixture({ createDraft })));
    await waitFor(() => expect(result.current.edited).not.toBeNull());

    await act(async () => {
      result.current.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>);
    });

    await waitFor(() => expect(result.current.errorsFor('PERSONAL').max_age).toBe('Min age must be less than max age.'));
    expect(result.current.topError).toBeNull();
  });
});
