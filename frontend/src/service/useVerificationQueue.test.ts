import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../repository/apiClient';
import * as verificationRepo from '../repository/verificationRepo';
import type { QueuePage } from '../types/apply';
import { useVerificationQueue, withoutItem } from './useVerificationQueue';

vi.mock('../repository/verificationRepo');

const PAGE: QueuePage = {
  items: [
    { document_id: 1, application_id: 10, type: 'ID_PROOF', uploaded_at: '2026-01-01T00:00:00Z' },
    { document_id: 2, application_id: 11, type: 'SALARY_SLIP', uploaded_at: '2026-01-02T00:00:00Z' },
  ],
  total: 2,
  limit: 50,
  offset: 0,
};

afterEach(() => vi.resetAllMocks());

describe('useVerificationQueue', () => {
  it('removes a verified item without reloading (E2-S4-AC3)', async () => {
    vi.mocked(verificationRepo.getQueue).mockResolvedValue(PAGE);
    vi.mocked(verificationRepo.verifyDocument).mockResolvedValue({});
    const { result } = renderHook(() => useVerificationQueue());
    await waitFor(() => expect(result.current.queue.data?.items).toHaveLength(2));
    let ok = false;
    await act(async () => {
      ok = await result.current.decide(PAGE.items[0]!, 'VERIFIED', 'Looks fine');
    });
    expect(ok).toBe(true);
    expect(result.current.queue.data?.items.map((i) => i.document_id)).toEqual([2]);
    expect(result.current.queue.data?.total).toBe(1);
    expect(verificationRepo.getQueue).toHaveBeenCalledTimes(1);
  });

  it('keeps the item and reports the error when the API refuses', async () => {
    vi.mocked(verificationRepo.getQueue).mockResolvedValue(PAGE);
    vi.mocked(verificationRepo.verifyDocument).mockRejectedValue(new ApiError('ALREADY_VERIFIED', 'Already verified.'));
    const { result } = renderHook(() => useVerificationQueue());
    await waitFor(() => expect(result.current.queue.data).not.toBeNull());
    await act(async () => {
      await result.current.decide(PAGE.items[0]!, 'VERIFIED', 'x');
    });
    expect(result.current.actionError?.code).toBe('ALREADY_VERIFIED');
    expect(result.current.queue.data?.items).toHaveLength(2);
  });

  it('withoutItem never drives the total below zero', () => {
    expect(withoutItem({ ...PAGE, total: 0 }, 1).total).toBe(0);
  });
});
