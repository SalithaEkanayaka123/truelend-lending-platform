import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useDetailsForm } from '../../service/useDetailsForm';
import type { ProductRule } from '../../types/policy';
import { DetailsStep } from './DetailsStep';

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

function Harness(): JSX.Element {
  const details = useDetailsForm(RULE);
  return <DetailsStep details={details} rule={RULE} />;
}

describe('DetailsStep', () => {
  afterEach(cleanup);

  it('shows range hints under the fields (E2-S4-AC2)', () => {
    render(<Harness />);
    expect(screen.getByText('12-60 months')).toBeInTheDocument();
    expect(screen.getByText('21-60 years')).toBeInTheDocument();
  });

  it('shows the 12-60 months error inline for tenure 72 (E2-S4-AC2)', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Tenure (months)'), '72');
    expect(screen.getByRole('alert')).toHaveTextContent('12-60 months');
  });

  it('upper-cases PAN and flags a bad Aadhaar after blur (E2-S4-AC2)', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('PAN'), 'abcde1234f');
    expect(screen.getByLabelText('PAN')).toHaveValue('ABCDE1234F');
    await userEvent.click(screen.getByLabelText('Aadhaar'));
    await userEvent.tab();
    expect(screen.getByText('Aadhaar is 12 digits.')).toBeInTheDocument();
  });

  it('toggles a credit flag', async () => {
    render(<Harness />);
    const box = screen.getByLabelText(/little or no credit history/);
    await userEvent.click(box);
    expect(box).toBeChecked();
  });
});
