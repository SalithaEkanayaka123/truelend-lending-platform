import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as authRepo from '../repository/authRepo';
import type { Role } from '../types/auth';
import { App } from './App';

vi.mock('../repository/authRepo');
vi.mock('./pages/PolicyEditorPage', () => ({
  PolicyEditorPage: () => <h1>Policy editor</h1>,
}));

const HOME_HEADING: Record<Role, string> = {
  CUSTOMER: 'My applications',
  UNDERWRITER: 'Work queue',
  ADMIN: 'Portfolio dashboard',
  POLICY_EDITOR: 'Policy editor',
};

async function signIn(role: Role, entry = '/'): Promise<void> {
  vi.mocked(authRepo.login).mockResolvedValue({
    access_token: `token-${role}`,
    token_type: 'bearer',
    expires_in: 1800,
    role,
  });
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
    </MemoryRouter>,
  );
  await user.type(screen.getByLabelText(/email/i), 'someone@example.test');
  await user.type(screen.getByLabelText(/password/i), 'pw');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('post-login routing by role', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it.each(Object.entries(HOME_HEADING) as [Role, string][])(
    'routes %s to its landing screen',
    async (role, heading) => {
      await signIn(role);
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    },
  );

  it.each<[Role, boolean]>([
    ['CUSTOMER', false],
    ['UNDERWRITER', false],
    ['ADMIN', true],
    ['POLICY_EDITOR', true],
  ])('%s sees the Policies link: %s', async (role, visible) => {
    await signIn(role);
    await screen.findByRole('navigation');
    const link = screen.queryByRole('link', { name: 'Policies' });
    expect(Boolean(link)).toBe(visible);
  });

  it.each<Role>(['CUSTOMER', 'UNDERWRITER'])(
    'shows a friendly No access page, with a way home, when %s opens /policies',
    async (role) => {
      await signIn(role, '/policies');
      expect(await screen.findByRole('heading', { name: /no access/i })).toBeInTheDocument();
      const home = screen.getByRole('link', { name: new RegExp(`go to ${HOME_HEADING[role]}`, 'i') });
      expect(home).toHaveAttribute('href', '/home');
      expect(screen.queryByText(/403|forbidden/i)).not.toBeInTheDocument();
    },
  );

  it('returns the user to the route they asked for after signing in', async () => {
    await signIn('ADMIN', '/policies');
    expect(await screen.findByRole('heading', { name: 'Policy editor' })).toBeInTheDocument();
  });

  it('shows Not found for an unknown route, with a way home', async () => {
    await signIn('ADMIN', '/nope');
    expect(await screen.findByRole('heading', { name: /not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to portfolio dashboard/i })).toBeInTheDocument();
  });

  it('Sign out returns to the sign-in form', async () => {
    await signIn('CUSTOMER');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /sign out/i }));
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });
});
