/** Sign-in state for the shared login gate (F0). Never logs the email,
 * password or token (NFR-03) -- errors surface only the backend's mapped
 * message. */

import { useCallback, useState } from 'react';

import { ApiError, setAuthToken } from '../repository/apiClient';
import * as authRepo from '../repository/authRepo';
import type { Role } from '../types/auth';

export interface UseAuthResult {
  token: string | null;
  role: Role | null;
  error: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export function useAuth(): UseAuthResult {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await authRepo.login(email, password);
      setAuthToken(response.access_token);
      setToken(response.access_token);
      setRole(response.role);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback((): void => {
    setAuthToken(null);
    setToken(null);
    setRole(null);
  }, []);

  return { token, role, error, loading, login, logout };
}
