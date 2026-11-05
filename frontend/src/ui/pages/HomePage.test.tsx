import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { LANDING_NAME } from '../../config/roleRoutes';
import type { Role } from '../../types/auth';
import { HomePage } from './HomePage';

function renderHome(role: Role): void {
  render(
    <MemoryRouter>
      <HomePage role={role} />
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  afterEach(() => {
    cleanup();
  });

  it.each<Role>(['CUSTOMER', 'UNDERWRITER', 'ADMIN'])('keeps the %s landing name as the page heading', (role) => {
    renderHome(role);
    expect(screen.getByRole('heading', { level: 1, name: LANDING_NAME[role] })).toBeInTheDocument();
  });

  it('shows ADMIN the Applications, Policies and Audit cards', () => {
    renderHome('ADMIN');
    for (const title of ['Applications', 'Policies', 'Audit']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.queryByRole('heading', { level: 2, name: 'Work queue' })).not.toBeInTheDocument();
  });

  it('links a built screen and labels the rest as coming soon', () => {
    renderHome('ADMIN');
    expect(screen.getByRole('link', { name: /policies/i })).toHaveAttribute('href', '/policies');
    expect(screen.queryByRole('link', { name: /audit/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(2);
  });

  it('shows the underwriter the Work queue and no Policies or Audit card', () => {
    renderHome('UNDERWRITER');
    expect(screen.getByRole('heading', { level: 2, name: 'Work queue' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Policies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Audit' })).not.toBeInTheDocument();
  });

  it('shows the applicant only their applications', () => {
    renderHome('CUSTOMER');
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Applications' })).toBeInTheDocument();
  });

  it('draws a decorative icon on every card', () => {
    renderHome('ADMIN');
    expect(document.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });
});
