import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationDetail } from '../../types/review';
import { DocumentsStep } from './DocumentsStep';

function app(statuses: ('MISSING' | 'UPLOADED' | 'VERIFIED' | 'REJECTED')[]): ApplicationDetail {
  return {
    id: 1,
    product_type: 'PERSONAL',
    requested_amount: '200000.00',
    tenure_months: 24,
    age_years: 30,
    monthly_income: '60000.00',
    pan_masked: 'XXXXX1234X',
    aadhaar_masked: 'XXXXXXXX9012',
    status: 'DRAFT',
    policy_version: 1,
    required_documents: statuses.map((status, i) => ({
      document_id: i + 1,
      type: i === 0 ? 'ID_PROOF' : 'ADDRESS_PROOF',
      status,
      filename: null,
      reason: status === 'REJECTED' ? 'Blurry scan' : null,
    })),
  };
}

function show(statuses: Parameters<typeof app>[0], highlight = false) {
  const onUpload = vi.fn();
  const onSubmit = vi.fn();
  render(<DocumentsStep application={app(statuses)} busy={false} highlightMissing={highlight} onUpload={onUpload} onSubmit={onSubmit} />);
  return { onUpload, onSubmit };
}

describe('DocumentsStep', () => {
  afterEach(cleanup);

  it('disables Submit until every row is uploaded or verified (E2-S4-AC1)', () => {
    show(['UPLOADED', 'MISSING']);
    expect(screen.getByRole('button', { name: 'Submit application' })).toBeDisabled();
  });

  it('enables Submit and calls it when all rows are done (E2-S4-AC1)', async () => {
    const { onSubmit } = show(['UPLOADED', 'VERIFIED']);
    const submit = screen.getByRole('button', { name: 'Submit application' });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('uploads a missing row by type', async () => {
    const { onUpload } = show(['UPLOADED', 'MISSING']);
    await userEvent.click(screen.getByRole('button', { name: 'Upload Address proof' }));
    expect(onUpload).toHaveBeenCalledWith('ADDRESS_PROOF');
    expect(screen.queryByRole('button', { name: 'Upload Id proof' })).not.toBeInTheDocument();
  });

  it('highlights only missing rows when asked', () => {
    show(['UPLOADED', 'MISSING'], true);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveAttribute('data-highlight');
    expect(items[1]).toHaveAttribute('data-highlight', 'true');
  });

  it('shows the verifier reason for a rejected row', () => {
    show(['REJECTED', 'UPLOADED']);
    expect(screen.getByText('Blurry scan')).toBeInTheDocument();
  });
});
