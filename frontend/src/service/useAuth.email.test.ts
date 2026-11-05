import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as authRepo from '../repository/authRepo';
import { useAuth } from './useAuth';

vi.mock('../repository/authRepo');

const RESPONSE = { access_token: 't', token_type: 'bearer', expires_in: 1800, role: 'ADMIN' } as const;

describe('useAuth email (shell display name)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the email after a successful login and clears it on logout', async () => {
    vi.mocked(authRepo.login).mockResolvedValue(RESPONSE);
    const { result } = renderHook(() => useAuth());
    expect(result.current.email).toBeNull();

    await act(async () => {
      await result.current.login('admin@example.test', 'pw');
    });
    expect(result.current.email).toBe('admin@example.test');

    act(() => {
      result.current.logout();
    });
    expect(result.current.email).toBeNull();
  });

  it('does not keep the email when the login fails', async () => {
    vi.mocked(authRepo.login).mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('admin@example.test', 'bad');
    });
    expect(result.current.email).toBeNull();
  });
});
