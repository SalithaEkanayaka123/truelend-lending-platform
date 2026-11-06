import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../repository/apiClient';
import * as applyRepo from '../../repository/applyRepo';
import * as policiesRepo from '../../repository/policiesRepo';
import type { ProductRule } from '../../types/policy';
import type { ApplicationDetail } from '../../types/review';
import { ApplyPage } from './ApplyPage';

vi.mock('../../repository/policiesRepo');
vi.mock('../../repository/applyRepo');
vi.mock('../../repository/applicationIdsStore');

const RULE: ProductRule = {
  product_type: 'PERSONAL',
  policy_version: 1,
  min_age: 21,
  max_age: 60,
  min_income: '25000.00',
  min_tenure_months: 12,
  max_tenure_months: 60,
  min_amount: '50000.00',
  max_amount: '1500000.00',
  annual_rate_pct: '12.00',
  auto_reject_below_score: 600,
  auto_approve_min_score: 700,
  required_documents: ['ID_PROOF'],
};

function draftApp(status: 'MISSING' | 'UPLOADED'): ApplicationDetail {
  return {
    id: 5,
    product_type: 'PERSONAL',
    requested_amount: '200000.00',
    tenure_months: 24,
    age_years: 30,
    monthly_income: '60000.00',
    pan_masked: 'XXXXX1234X',
    aadhaar_masked: 'XXXXXXXX9012',
    status: 'DRAFT',
    policy_version: 1,
    required_documents: [{ document_id: 1, type: 'ID_PROOF', status, filename: null, reason: null }],
  };
}

const ROUTES = (
  <Routes>
    <Route path="/apply" element={<ApplyPage />} />
    <Route path="/applications/:id" element={<p>Tracker opened</p>} />
  </Routes>
);

const renderPage = (): void => {
  render(<MemoryRouter initialEntries={['/apply']}>{ROUTES}</MemoryRouter>);
};

const FIELDS: [string, string][] = [
  ['Loan amount (INR)', '200000'],
  ['Tenure (months)', '24'],
  ['Age (years)', '30'],
  ['Monthly income (INR)', '60000'],
  ['PAN', 'ABCDE1234F'],
  ['Aadhaar', '123456789012'],
];

const fillDetails = async (): Promise<void> => {
  for (const [label, value] of FIELDS) await userEvent.type(screen.getByLabelText(label), value);
};

const toDetails = async (): Promise<void> => {
  await userEvent.click(await screen.findByRole('radio'));
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
};

describe('ApplyPage', () => {
  beforeEach(() => {
    vi.mocked(policiesRepo.listProducts).mockResolvedValue([RULE]);
  });
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('shows one step at a time with progress (E2-S4-AC1)', async () => {
    renderPage();
    expect(await screen.findByText('Choose a loan product')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tenure (months)')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await toDetails();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.queryByText('Choose a loan product')).not.toBeInTheDocument();
  });

  it('shows the tenure range error and blocks Continue (E2-S4-AC2)', async () => {
    renderPage();
    await toDetails();
    await userEvent.type(screen.getByLabelText('Tenure (months)'), '72');
    expect(screen.getByRole('alert')).toHaveTextContent('12-60 months');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('creates the draft, uploads, submits and opens the tracker (E2-S4-AC1)', async () => {
    vi.mocked(applyRepo.createApplication).mockResolvedValue(draftApp('MISSING'));
    vi.mocked(applyRepo.uploadDocument).mockResolvedValue(draftApp('UPLOADED'));
    vi.mocked(applyRepo.submitApplication).mockResolvedValue(draftApp('UPLOADED'));
    vi.mocked(applyRepo.underwriteApplication).mockResolvedValue({
      decision: 'AUTO_APPROVE', score: 750, reason_codes: [], policy_version: 1, status: 'APPROVED',
    });
    renderPage();
    await toDetails();
    await fillDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Step 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Upload Id proof' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Submit application' }));
    expect(await screen.findByText('Tracker opened')).toBeInTheDocument();
    expect(applyRepo.underwriteApplication).toHaveBeenCalledWith(5);
  });

  it('shows the API error when product loading fails', async () => {
    vi.mocked(policiesRepo.listProducts).mockRejectedValue(new ApiError('INTERNAL', 'Catalog down', 'cid-9'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Catalog down');
  });
});
