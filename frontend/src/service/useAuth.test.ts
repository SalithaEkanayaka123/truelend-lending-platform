import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../repository/apiClient';
import * as authRepo from '../repository/authRepo';
import { useAuth } from './useAuth';

vi.mock('../repository/authRepo');

describe('useAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores the token and role on a successful login', async () => {
    vi.mocked(authRepo.login).mockResolvedValue({
      access_token: 'demo-token',
      token_type: 'bearer',
      expires_in: 1800,
      role: 'POLICY_EDITOR',
    });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('policy@example.test', 'pw');
    });

    expect(result.current.token).toBe('demo-token');
    expect(result.current.role).toBe('POLICY_EDITOR');
    expect(result.current.error).toBeNull();
  });

  it('surfaces the ApiError message on a failed login without setting a token', async () => {
    vi.mocked(authRepo.login).mockRejectedValue(
      new ApiError('UNAUTHENTICATED', 'Invalid email or password.'),
    );
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('wrong@example.test', 'bad');
    });

    expect(result.current.token).toBeNull();
    expect(result.current.error).toBe('Invalid email or password.');
  });

  it('clears the token and role on logout', async () => {
    vi.mocked(authRepo.login).mockResolvedValue({
      access_token: 'demo-token',
      token_type: 'bearer',
      expires_in: 1800,
      role: 'POLICY_EDITOR',
    });
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('policy@example.test', 'pw');
    });
    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.role).toBeNull();
  });
});
