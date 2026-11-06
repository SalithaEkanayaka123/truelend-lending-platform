import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { HOME_LEAD } from '../../config/homeCards';
import type { Role } from '../../types/auth';
import { HomePage } from './HomePage';

function renderHome(role: Role, userName = 'Priya Nair'): void {
  render(
    <MemoryRouter>
      <HomePage role={role} userName={userName} />
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  afterEach(() => {
    cleanup();
  });

  it.each<Role>(['CUSTOMER', 'UNDERWRITER', 'ADMIN', 'POLICY_EDITOR'])(
    'welcomes the user by name and states what %s does here',
    (role) => {
      renderHome(role, 'Priya Nair');
      expect(screen.getByRole('heading', { level: 1, name: 'Welcome, Priya Nair' })).toBeInTheDocument();
      expect(screen.getByText(HOME_LEAD[role])).toBeInTheDocument();
      expect(screen.queryByText(/pick up where you left off/i)).not.toBeInTheDocument();
    },
  );

  it('does not title the applicant home "My applications"', () => {
    renderHome('CUSTOMER');
    expect(screen.queryByRole('heading', { level: 1, name: 'My applications' })).not.toBeInTheDocument();
  });

  it('gives the applicant linked Apply and My applications cards and nothing coming soon', () => {
    renderHome('CUSTOMER');
    expect(screen.getByRole('link', { name: /apply for a loan/i })).toHaveAttribute('href', '/apply');
    expect(screen.getByRole('link', { name: /my applications/i })).toHaveAttribute('href', '/applications');
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('links the underwriter to the verification queue and marks only Work queue as coming soon', () => {
    renderHome('UNDERWRITER');
    expect(screen.getByRole('link', { name: /verification queue/i })).toHaveAttribute('href', '/verification');
    expect(screen.getByRole('heading', { level: 2, name: 'Work queue' })).toBeInTheDocument();
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 2, name: 'Policies' })).not.toBeInTheDocument();
  });

  it('links ADMIN to Policies and marks only Audit as coming soon', () => {
    renderHome('ADMIN');
    expect(screen.getByRole('link', { name: /policies/i })).toHaveAttribute('href', '/policies');
    expect(screen.queryByRole('link', { name: /audit/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(1);
  });

  it('draws a decorative icon on every card', () => {
    renderHome('CUSTOMER');
    expect(document.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2);
  });
});
