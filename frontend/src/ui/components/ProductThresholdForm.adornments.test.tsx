import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProductRule } from '../../types/policy';
import { ProductThresholdForm } from './ProductThresholdForm';

const rule: ProductRule = {
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

function renderForm(overrides: Partial<ProductRule> = {}, errors = {}): void {
  render(<ProductThresholdForm productType="PERSONAL" rule={{ ...rule, ...overrides }} errors={errors} onChange={vi.fn()} />);
}

function fieldOf(label: RegExp): HTMLElement {
  const wrapper = screen.getByLabelText(label).closest('[data-field]');
  if (!(wrapper instanceof HTMLElement)) throw new Error('field wrapper not found');
  return wrapper;
}

describe('ProductThresholdForm adornments', () => {
  afterEach(() => {
    cleanup();
  });

  it('puts a ₹ prefix on money inputs and keeps the input value as the raw string', () => {
    renderForm();
    expect(within(fieldOf(/min amount/i)).getByText('₹')).toBeInTheDocument();
    expect(screen.getByLabelText(/min amount/i)).toHaveValue('50000.00');
  });

  it('shows the grouped value as a hint the input is described by', () => {
    renderForm();
    const input = screen.getByLabelText(/max amount/i);
    const hint = within(fieldOf(/max amount/i)).getByText('₹1,500,000.00');
    expect(input.getAttribute('aria-describedby')).toContain(hint.id);
  });

  it('puts a months suffix on tenure, a % suffix on the rate, and none on ages', () => {
    renderForm();
    expect(within(fieldOf(/min tenure/i)).getByText('months')).toBeInTheDocument();
    expect(within(fieldOf(/max tenure/i)).getByText('months')).toBeInTheDocument();
    expect(within(fieldOf(/annual rate/i)).getByText('%')).toBeInTheDocument();
    expect(within(fieldOf(/min age/i)).queryByText('months')).not.toBeInTheDocument();
  });

  it('follows the edited value in the hint', () => {
    renderForm({ min_amount: '1234567.5' });
    expect(within(fieldOf(/min amount/i)).getByText('₹1,234,567.5')).toBeInTheDocument();
  });

  it('keeps the error inline and linked, with the hint also describing a money field', () => {
    renderForm({}, { min_amount: 'Min amount must not exceed max amount.' });
    const input = screen.getByLabelText(/min amount/i);
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Min amount must not exceed max amount.');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows no hint for an empty money value', () => {
    renderForm({ min_income: '' });
    expect(within(fieldOf(/min income/i)).queryByText(/₹\d/)).not.toBeInTheDocument();
  });
});
