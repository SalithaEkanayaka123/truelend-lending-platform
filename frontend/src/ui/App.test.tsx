import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as authRepo from '../repository/authRepo';
import type { Role } from '../types/auth';
import { App } from './App';

vi.mock('../repository/authRepo');
vi.mock('./pages/ReviewPage', () => ({
  ReviewPage: () => <h1>Review page</h1>,
}));
vi.mock('./pages/ApplyPage', () => ({
  ApplyPage: () => <h1>Apply page</h1>,
}));
vi.mock('./pages/MyApplicationsPage', () => ({
  MyApplicationsPage: () => <h1>Applications list</h1>,
}));
vi.mock('./pages/VerificationPage', () => ({
  VerificationPage: () => <h1>Verification page</h1>,
}));
vi.mock('./pages/TrackPage', () => ({
  TrackPage: () => <h1>Tracker page</h1>,
}));
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

  it.each<[Role, string]>([
    ['UNDERWRITER', 'Review page'],
    ['ADMIN', 'Review page'],
    ['CUSTOMER', 'Tracker page'],
  ])('%s opening /applications/6 sees: %s', async (role, heading) => {
    await signIn(role, '/applications/6');
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
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

  it.each<[Role, string, string]>([
    ['CUSTOMER', '/apply', 'Apply page'],
    ['CUSTOMER', '/applications', 'Applications list'],
    ['UNDERWRITER', '/verification', 'Verification page'],
  ])('%s opening %s sees: %s', async (role, path, heading) => {
    await signIn(role, path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
  });

  it.each<[Role, string]>([
    ['UNDERWRITER', '/apply'],
    ['ADMIN', '/applications'],
    ['CUSTOMER', '/verification'],
    ['POLICY_EDITOR', '/applications/6'],
  ])('%s opening %s gets the No access page', async (role, path) => {
    await signIn(role, path);
    expect(await screen.findByRole('heading', { name: /no access/i })).toBeInTheDocument();
  });

  it.each<[Role, string[]]>([
    ['CUSTOMER', ['Home', 'My applications', 'Apply']],
    ['UNDERWRITER', ['Home', 'Verification']],
  ])('%s sees nav links %j', async (role, labels) => {
    await signIn(role);
    const nav = await screen.findByRole('navigation');
    const names = within(nav).getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(labels);
  });

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
