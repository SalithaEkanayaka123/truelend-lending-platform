import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROLE_LABEL } from '../../config/roleRoutes';
import type { Role } from '../../types/auth';
import { AppShell } from './AppShell';

function renderShell(role: Role, entry = '/home', onSignOut = vi.fn()): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AppShell role={role} userName="Jane Doe" onSignOut={onSignOut}>
        <p>page body</p>
      </AppShell>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows the brand, the user name and a role badge', () => {
    renderShell('ADMIN');
    const header = screen.getByRole('banner');
    expect(within(header).getByText('TrueLend')).toBeInTheDocument();
    expect(within(header).getByText('Jane Doe')).toBeInTheDocument();
    expect(within(header).getByText(ROLE_LABEL.ADMIN)).toBeInTheDocument();
  });

  it.each<Role>(['CUSTOMER', 'UNDERWRITER', 'POLICY_EDITOR', 'ADMIN'])('labels the %s role in plain words', (role) => {
    renderShell(role);
    expect(screen.getByText(ROLE_LABEL[role])).toBeInTheDocument();
  });

  it('marks the active nav item with aria-current', () => {
    renderShell('ADMIN', '/policies');
    expect(screen.getByRole('link', { name: 'Policies' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('offers a skip link to the content and renders the page body inside it', () => {
    renderShell('CUSTOMER');
    const skip = screen.getByRole('link', { name: /skip to content/i });
    expect(skip).toHaveAttribute('href', '#content');
    expect(document.getElementById('content')).toContainElement(screen.getByText('page body'));
  });

  it('calls onSignOut from the Sign out button', async () => {
    const onSignOut = vi.fn();
    renderShell('CUSTOMER', '/home', onSignOut);
    await userEvent.setup().click(screen.getByRole('button', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
