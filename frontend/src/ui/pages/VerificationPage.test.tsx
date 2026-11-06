import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../repository/apiClient';
import * as verificationRepo from '../../repository/verificationRepo';
import type { QueuePage } from '../../types/apply';
import { VerificationPage } from './VerificationPage';

vi.mock('../../repository/verificationRepo');

const PAGE: QueuePage = {
  items: [
    { document_id: 1, application_id: 10, type: 'ID_PROOF', uploaded_at: '2026-01-01T00:00:00Z' },
    { document_id: 2, application_id: 11, type: 'SALARY_SLIP', uploaded_at: '2026-01-02T00:00:00Z' },
  ],
  total: 2,
  limit: 50,
  offset: 0,
};

const openVerify = async (): Promise<void> => {
  const table = within(await screen.findByTestId('queue-table'));
  await userEvent.click(table.getByRole('button', { name: 'Verify Id proof for application 10' }));
};

describe('VerificationPage', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('lists the queue as a table and as cards (E2-S4-AC3)', async () => {
    vi.mocked(verificationRepo.getQueue).mockResolvedValue(PAGE);
    render(<VerificationPage />);
    expect(within(await screen.findByTestId('queue-table')).getAllByRole('row')).toHaveLength(3);
    expect(within(screen.getByTestId('queue-cards')).getAllByRole('listitem')).toHaveLength(2);
  });

  it('verifies through the reason dialog and removes the row without reloading (E2-S4-AC3)', async () => {
    vi.mocked(verificationRepo.getQueue).mockResolvedValue(PAGE);
    vi.mocked(verificationRepo.verifyDocument).mockResolvedValue({});
    render(<VerificationPage />);
    await openVerify();
    await userEvent.type(screen.getByLabelText('Reason'), 'Matches records');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm verify' }));
    expect(verificationRepo.verifyDocument).toHaveBeenCalledWith(1, 'VERIFIED', 'Matches records');
    expect(await screen.findAllByText('#11')).not.toHaveLength(0);
    expect(screen.queryByText('#10')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(verificationRepo.getQueue).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open and shows the error when the API refuses (E2-S4-AC3)', async () => {
    vi.mocked(verificationRepo.getQueue).mockResolvedValue(PAGE);
    vi.mocked(verificationRepo.verifyDocument).mockRejectedValue(new ApiError('CONFLICT', 'Already decided'));
    render(<VerificationPage />);
    await openVerify();
    await userEvent.type(screen.getByLabelText('Reason'), 'ok');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm verify' }));
    expect(await screen.findByText('Already decided')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('#10')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    vi.mocked(verificationRepo.getQueue).mockResolvedValue({ ...PAGE, items: [], total: 0 });
    render(<VerificationPage />);
    expect(await screen.findByText('All documents are verified.')).toBeInTheDocument();
  });

  it('shows a retryable error when loading fails', async () => {
    vi.mocked(verificationRepo.getQueue).mockRejectedValue(new ApiError('INTERNAL', 'Queue down', 'cid-2'));
    render(<VerificationPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Queue down');
  });
});
