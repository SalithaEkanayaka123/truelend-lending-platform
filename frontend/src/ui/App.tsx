/** Root shell: the shared sign-in gate (F0), then a role check before the
 * Policy editor. No router yet -- this story's only screen is S-M-4; other
 * roles/screens arrive with their own stories. */

import type { JSX } from 'react';

import { useAuth } from '../service/useAuth';
import { LoginPage } from './pages/LoginPage';
import { PolicyEditorPage } from './pages/PolicyEditorPage';

const POLICY_ROLES = new Set(['POLICY_EDITOR', 'ADMIN']);

export function App(): JSX.Element {
  const { token, role, error, loading, login } = useAuth();

  if (!token) {
    return <LoginPage onLogin={login} error={error} loading={loading} />;
  }
  if (!role || !POLICY_ROLES.has(role)) {
    return <p role="alert">No access.</p>;
  }
  return <PolicyEditorPage />;
}
