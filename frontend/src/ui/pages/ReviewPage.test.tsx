import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../repository/apiClient';
import * as reviewRepo from '../../repository/reviewRepo';
import type { Role } from '../../types/auth';
import type { ApplicationDetail, DecisionDetail } from '../../types/review';
import { ReviewPage } from './ReviewPage';

vi.mock('../../repository/reviewRepo');

function application(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    id: 6,
    product_type: 'PERSONAL',
    requested_amount: '200000.00',
    tenure_months: 24,
    age_years: 30,
    monthly_income: '60000.00',
    pan_masked: 'XXXXX1234X',
    aadhaar_masked: 'XXXXXXXX9012',
    status: 'MANUAL_REVIEW',
    policy_version: 1,
    required_documents: [{ document_id: 1, type: 'ID_PROOF', status: 'VERIFIED', filename: 'id.png', reason: null }],
    ...overrides,
  };
}

function decision(overrides: Partial<DecisionDetail> = {}): DecisionDetail {
  return {
    application_id: 6,
    status: 'MANUAL_REVIEW',
    decision: 'MANUAL_REVIEW',
    score: 650,
    reason_codes: [{ code: 'SCORE_BETWEEN_THRESHOLDS', message: 'Score sits between the thresholds.' }],
    policy_version: 1,
    decided_at: '2026-01-01T00:00:00Z',
    thresholds: { auto_reject_below_score: 600, auto_approve_min_score: 700 },
    override_reason_codes: ['COMPENSATING_FACTORS', 'DATA_CORRECTION'],
    resolution: null,
    ...overrides,
  };
}

function renderPage(role: Role): void {
  const page = <ReviewPage role={role} />;
  render(
    <MemoryRouter initialEntries={['/applications/6']}>
      <Routes>
        <Route path="/applications/:id" element={page} />
      </Routes>
    </MemoryRouter>,
  );
}

function load(app: ApplicationDetail, dec: DecisionDetail | null): void {
  vi.mocked(reviewRepo.getApplication).mockResolvedValue(app);
  vi.mocked(reviewRepo.getDecision).mockResolvedValue(dec);
}

const APPROVED = decision({
  status: 'APPROVED',
  resolution: {
    kind: 'MANUAL_REVIEW',
    outcome: 'APPROVED',
    reason_code: null,
    comment: 'Stable income',
    resolved_by: 3,
    resolved_at: '2026-01-02T00:00:00Z',
  },
});

describe('ReviewPage', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('shows masked identifiers, documents and the score (E3-S5-AC1)', async () => {
    load(application(), decision());
    renderPage('UNDERWRITER');
    expect(await screen.findByText('XXXXX1234X')).toBeInTheDocument();
    expect(screen.getByText('₹200,000.00')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /credit score 650/i })).toBeInTheDocument();
    expect(screen.getByText('SCORE_BETWEEN_THRESHOLDS')).toBeInTheDocument();
  });

  it('keeps Approve and Reject disabled until a reason is typed, then approves (E3-S5-AC1)', async () => {
    load(application(), decision());
    vi.mocked(reviewRepo.submitReview).mockResolvedValue(APPROVED);
    renderPage('UNDERWRITER');
    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Reason'), 'Stable income');
    await userEvent.click(approve);
    expect(reviewRepo.submitReview).toHaveBeenCalledWith(6, 'APPROVE', 'Stable income');
    expect(await screen.findByTestId('resolution')).toHaveTextContent('Stable income');
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('overrides an auto-reject through a dialog needing a code and a comment (E3-S5-AC3)', async () => {
    load(application({ status: 'REJECTED' }), decision({ status: 'REJECTED', decision: 'AUTO_REJECT' }));
    vi.mocked(reviewRepo.submitOverride).mockResolvedValue(decision({ status: 'APPROVED', decision: 'AUTO_REJECT' }));
    renderPage('ADMIN');
    await userEvent.click(await screen.findByRole('button', { name: 'Override' }));
    const submit = screen.getByRole('button', { name: 'Submit override' });
    expect(submit).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Reason code'), 'COMPENSATING_FACTORS');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Comment'), 'Co-signed');
    await userEvent.click(submit);
    expect(reviewRepo.submitOverride).toHaveBeenCalledWith(6, 'COMPENSATING_FACTORS', 'Co-signed');
    expect(await screen.findByText(/override recorded/i)).toBeInTheDocument();
  });

  it('offers no review form to an admin (E3-S5-AC5)', async () => {
    load(application(), decision());
    renderPage('ADMIN');
    await screen.findByText('XXXXX1234X');
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('shows an error card with Retry when loading fails', async () => {
    vi.mocked(reviewRepo.getApplication).mockRejectedValue(new ApiError('HTTP_ERROR', 'Server trouble', 'c-1'));
    vi.mocked(reviewRepo.getDecision).mockResolvedValue(null);
    renderPage('UNDERWRITER');
    expect(await screen.findByText('Server trouble')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
