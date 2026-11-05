/** Thin wrapper around `POST /api/auth/login` (F0). The only place that
 * builds the login request body; nothing else calls `apiClient` for auth. */

import type { LoginResponse } from '../types/auth';
import { apiRequest } from './apiClient';

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}
