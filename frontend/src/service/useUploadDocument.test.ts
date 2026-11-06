import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../repository/apiClient';
import * as applyRepo from '../repository/applyRepo';
import { useUploadDocument } from './useUploadDocument';

vi.mock('../repository/applyRepo');

afterEach(() => vi.resetAllMocks());

describe('useUploadDocument', () => {
  it('uploads a stub file and calls onDone (E2-S4-AC4)', async () => {
    vi.mocked(applyRepo.uploadDocument).mockResolvedValue({} as never);
    const onDone = vi.fn();
    const { result } = renderHook(() => useUploadDocument(7, onDone));
    await act(() => result.current.upload('ID_PROOF'));
    expect(applyRepo.uploadDocument).toHaveBeenCalledWith(7, 'ID_PROOF', 'id_proof.pdf');
    expect(onDone).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it('keeps the API error and does not call onDone', async () => {
    vi.mocked(applyRepo.uploadDocument).mockRejectedValue(new ApiError('CONFLICT', 'Locked', 'cid'));
    const onDone = vi.fn();
    const { result } = renderHook(() => useUploadDocument(7, onDone));
    await act(() => result.current.upload('ID_PROOF'));
    expect(result.current.error?.message).toBe('Locked');
    expect(onDone).not.toHaveBeenCalled();
  });
});
