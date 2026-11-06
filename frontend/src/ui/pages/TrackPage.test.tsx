import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../repository/apiClient';
import * as applyRepo from '../../repository/applyRepo';
import * as reviewRepo from '../../repository/reviewRepo';
import type { ApplicationDetail, DecisionDetail } from '../../types/review';
import { TrackPage } from './TrackPage';

vi.mock('../../repository/reviewRepo');
vi.mock('../../repository/applyRepo');

const APP: ApplicationDetail = {
  id: 3,
  product_type: 'PERSONAL',
  requested_amount: '200000.00',
  tenure_months: 24,
  age_years: 30,
  monthly_income: '60000.00',
  pan_masked: 'XXXXX1234X',
  aadhaar_masked: 'XXXXXXXX9012',
  status: 'SUBMITTED',
  policy_version: 1,
  required_documents: [
    { document_id: 1, type: 'ID_PROOF', status: 'REJECTED', filename: 'id.pdf', reason: 'Blurry scan' },
    { document_id: 2, type: 'ADDRESS_PROOF', status: 'VERIFIED', filename: 'a.pdf', reason: null },
  ],
};

const DECISION: DecisionDetail = {
  application_id: 3,
  status: 'REJECTED',
  decision: 'AUTO_REJECT',
  score: 500,
  reason_codes: [{ code: 'SCORE_BELOW_MIN', message: 'Score is below the minimum.' }],
  policy_version: 1,
  decided_at: '2026-01-01T00:00:00Z',
  thresholds: { auto_reject_below_score: 600, auto_approve_min_score: 700 },
  override_reason_codes: [],
  resolution: null,
};

const ROUTES = (
  <Routes>
    <Route path="/applications/:id" element={<TrackPage />} />
  </Routes>
);

const renderPage = (): void => {
  render(<MemoryRouter initialEntries={['/applications/3']}>{ROUTES}</MemoryRouter>);
};

describe('TrackPage', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('shows the stepper, decision with reason message and rejected-document reason (E2-S4-AC4)', async () => {
    vi.mocked(reviewRepo.getApplication).mockResolvedValue(APP);
    vi.mocked(reviewRepo.getDecision).mockResolvedValue(DECISION);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Application #3' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Application status' })).toBeInTheDocument();
    expect(screen.getByText('Score is below the minimum.')).toBeInTheDocument();
    expect(screen.getByText('Blurry scan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve|Override/ })).not.toBeInTheDocument();
  });

  it('offers Upload only for rejected rows and reloads after it (E2-S4-AC4)', async () => {
    vi.mocked(reviewRepo.getApplication).mockResolvedValue(APP);
    vi.mocked(reviewRepo.getDecision).mockResolvedValue(null);
    vi.mocked(applyRepo.uploadDocument).mockResolvedValue(APP);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Upload Id proof' }));
    expect(applyRepo.uploadDocument).toHaveBeenCalledWith(3, 'ID_PROOF', 'id_proof.pdf');
    expect(screen.queryByRole('button', { name: 'Upload Address proof' })).not.toBeInTheDocument();
    expect(reviewRepo.getApplication).toHaveBeenCalledTimes(2);
  });

  it('shows Not found when the API refuses another customer application (E2-S4-AC4)', async () => {
    vi.mocked(reviewRepo.getApplication).mockRejectedValue(new ApiError('NOT_FOUND', 'No such application'));
    vi.mocked(reviewRepo.getDecision).mockResolvedValue(null);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('maps FORBIDDEN to Not found as well', async () => {
    vi.mocked(reviewRepo.getApplication).mockRejectedValue(new ApiError('FORBIDDEN', 'Nope'));
    vi.mocked(reviewRepo.getDecision).mockResolvedValue(null);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });
});
