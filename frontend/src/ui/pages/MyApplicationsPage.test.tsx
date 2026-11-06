import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as idsStore from '../../repository/applicationIdsStore';
import * as reviewRepo from '../../repository/reviewRepo';
import type { ApplicationDetail } from '../../types/review';
import { MyApplicationsPage } from './MyApplicationsPage';

vi.mock('../../repository/applicationIdsStore');
vi.mock('../../repository/reviewRepo');

function app(id: number, status: ApplicationDetail['status']): ApplicationDetail {
  return {
    id,
    product_type: 'PERSONAL',
    requested_amount: '200000.00',
    tenure_months: 24,
    age_years: 30,
    monthly_income: '60000.00',
    pan_masked: 'XXXXX1234X',
    aadhaar_masked: 'XXXXXXXX9012',
    status,
    policy_version: 1,
    required_documents: [],
  };
}

const renderPage = (): void => {
  render(
    <MemoryRouter>
      <MyApplicationsPage />
    </MemoryRouter>,
  );
};

describe('MyApplicationsPage', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('lists remembered applications with status and amount, linking to the tracker (E2-S4-AC4)', async () => {
    vi.mocked(idsStore.readApplicationIds).mockReturnValue([2, 1]);
    vi.mocked(reviewRepo.getApplication).mockImplementation(async (id) => app(id, id === 2 ? 'APPROVED' : 'SUBMITTED'));
    renderPage();
    const link = await screen.findByRole('link', { name: /Application #2/ });
    expect(link).toHaveAttribute('href', '/applications/2');
    expect(link).toHaveTextContent('Approved');
    expect(screen.getAllByText(/₹200,000.00/)).toHaveLength(2);
  });

  it('drops ids the user cannot read', async () => {
    vi.mocked(idsStore.readApplicationIds).mockReturnValue([2, 9]);
    vi.mocked(reviewRepo.getApplication).mockImplementation(async (id) => {
      if (id === 9) throw new Error('nope');
      return app(id, 'SUBMITTED');
    });
    renderPage();
    expect(await screen.findByRole('link', { name: /Application #2/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Application #9/ })).not.toBeInTheDocument();
  });

  it('shows the empty state with a way to start', async () => {
    vi.mocked(idsStore.readApplicationIds).mockReturnValue([]);
    renderPage();
    expect(await screen.findByText('You have no applications yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start an application' })).toHaveAttribute('href', '/apply');
  });
});
