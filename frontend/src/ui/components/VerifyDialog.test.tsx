import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QueueItem } from '../../types/apply';
import { VerifyDialog } from './VerifyDialog';

const ITEM: QueueItem = { document_id: 4, application_id: 9, type: 'SALARY_SLIP', uploaded_at: '2026-01-01T00:00:00Z' };

function show(outcome: 'VERIFIED' | 'REJECTED' = 'VERIFIED', error = null as null | { message: string; code: string; correlationId: string | null }) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  render(<VerifyDialog item={ITEM} outcome={outcome} submitting={false} error={error} onSubmit={onSubmit} onClose={onClose} />);
  return { onSubmit, onClose };
}

describe('VerifyDialog', () => {
  afterEach(cleanup);

  it('keeps confirm disabled until a reason is typed and shows the counter (E2-S4-AC3)', async () => {
    const { onSubmit } = show();
    const confirm = screen.getByRole('button', { name: 'Confirm verify' });
    expect(confirm).toBeDisabled();
    expect(screen.getByTestId('reason-counter')).toHaveTextContent('0/500');
    await userEvent.type(screen.getByLabelText('Reason'), 'Looks fine');
    expect(screen.getByTestId('reason-counter')).toHaveTextContent('10/500');
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith('Looks fine');
  });

  it('treats a blank reason as empty', async () => {
    show('REJECTED');
    await userEvent.type(screen.getByLabelText('Reason'), '   ');
    expect(screen.getByRole('button', { name: 'Confirm reject' })).toBeDisabled();
  });

  it('caps the reason at 500 characters', () => {
    show();
    expect(screen.getByLabelText('Reason')).toHaveAttribute('maxlength', '500');
  });

  it('shows an API error and cancels', async () => {
    const { onClose } = show('VERIFIED', { message: 'Already verified', code: 'CONFLICT', correlationId: 'c-1' });
    expect(screen.getByRole('alert')).toHaveTextContent('Already verified');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
