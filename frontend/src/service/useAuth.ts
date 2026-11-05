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
  /** In memory only; used for the shell's display name, never logged. */
  email: string | null;
  error: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

interface Session {
  token: string | null;
  role: Role | null;
  email: string | null;
}

const SIGNED_OUT: Session = { token: null, role: null, email: null };

export function useAuth(): UseAuthResult {
  const [session, setSession] = useState<Session>(SIGNED_OUT);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const response = await authRepo.login(email, password);
      setAuthToken(response.access_token);
      setSession({ token: response.access_token, role: response.role, email });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback((): void => {
    setAuthToken(null);
    setSession(SIGNED_OUT);
  }, []);

  return { ...session, error, loading, login, logout };
}
