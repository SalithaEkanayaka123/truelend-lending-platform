import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../repository/apiClient';
import * as policiesRepo from '../repository/policiesRepo';
import type { PolicyVersion, ProductRule } from '../types/policy';
import { usePolicies } from './usePolicies';

vi.mock('../repository/policiesRepo');

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
const vehicle: ProductRule = { ...personal, product_type: 'VEHICLE' };
const education: ProductRule = { ...personal, product_type: 'EDUCATION' };

describe('usePolicies', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads products and tolerates a failed version list (E4-S1 gap)', async () => {
    vi.mocked(policiesRepo.listProducts).mockResolvedValue([personal, vehicle, education]);
    vi.mocked(policiesRepo.listPolicies).mockRejectedValue(new Error('not implemented'));

    const { result } = renderHook(() => usePolicies());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.products).toHaveLength(3);
    expect(result.current.baseVersion).toBe(1);
    expect(result.current.versions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('exposes the error code and correlation id of a failed products load', async () => {
    vi.mocked(policiesRepo.listProducts).mockRejectedValue(
      new ApiError('INTERNAL_ERROR', 'An unexpected error occurred.', 'corr-1'),
    );
    vi.mocked(policiesRepo.listPolicies).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    const { result } = renderHook(() => usePolicies());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('An unexpected error occurred.');
    expect(result.current.loadError).toEqual({ code: 'INTERNAL_ERROR', correlationId: 'corr-1' });
  });

  it('reload clears the error and fetches the catalog again', async () => {
    vi.mocked(policiesRepo.listProducts)
      .mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 'boom', 'corr-1'))
      .mockResolvedValue([personal, vehicle, education]);
    vi.mocked(policiesRepo.listPolicies).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    const { result } = renderHook(() => usePolicies());
    await waitFor(() => expect(result.current.error).toBe('boom'));

    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.products).toHaveLength(3));

    expect(result.current.error).toBeNull();
    expect(result.current.loadError).toBeNull();
  });

  it('prepends the new draft to the version list and advances the base version (E4-S2-AC3)', async () => {
    vi.mocked(policiesRepo.listProducts).mockResolvedValue([personal, vehicle, education]);
    vi.mocked(policiesRepo.listPolicies).mockResolvedValue({
      items: [
        {
          version: 1,
          status: 'APPROVED',
          base_version: null,
          created_by: 1,
          created_at: 't1',
          approved_by: 1,
          approved_at: 't1',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    const created: PolicyVersion = {
      version: 2,
      status: 'DRAFT',
      base_version: 1,
      created_by: 2,
      created_at: 't2',
      approved_by: null,
      approved_at: null,
    };
    vi.mocked(policiesRepo.createPolicy).mockResolvedValue(created);

    const { result } = renderHook(() => usePolicies());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned: PolicyVersion | undefined;
    await act(async () => {
      returned = await result.current.createDraft({ PERSONAL: { min_age: 25 } });
    });

    expect(returned).toEqual(created);
    expect(result.current.versions[0]).toEqual(created);
    expect(result.current.baseVersion).toBe(2);
  });

  it('surfaces an ApiError from createDraft to the caller instead of swallowing it', async () => {
    vi.mocked(policiesRepo.listProducts).mockResolvedValue([personal, vehicle, education]);
    vi.mocked(policiesRepo.listPolicies).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    vi.mocked(policiesRepo.createPolicy).mockRejectedValue(
      new ApiError('VALIDATION_ERROR', 'PERSONAL.min_age: must be less than max_age'),
    );

    const { result } = renderHook(() => usePolicies());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.createDraft({})).rejects.toBeInstanceOf(ApiError);
  });
});
