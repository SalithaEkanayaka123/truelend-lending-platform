import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FieldErrors } from '../../service/policyValidation';
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
  required_documents: ['ID_PROOF', 'ADDRESS_PROOF', 'SALARY_SLIP'],
};

describe('ProductThresholdForm', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders pre-filled values for each editable field', () => {
    render(<ProductThresholdForm productType="PERSONAL" rule={rule} errors={{}} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/min age/i)).toHaveValue(21);
    expect(screen.getByLabelText(/max age/i)).toHaveValue(60);
    expect(screen.getByLabelText(/min amount/i)).toHaveValue('50000.00');
  });

  it('shows the error text linked by aria-describedby when a field has one', () => {
    const errors: FieldErrors = { max_age: 'Min age must be less than max age.' };
    render(<ProductThresholdForm productType="PERSONAL" rule={rule} errors={errors} onChange={vi.fn()} />);
    const maxAgeInput = screen.getByLabelText(/max age/i);
    expect(maxAgeInput).toHaveAttribute('aria-invalid', 'true');
    const describedBy = maxAgeInput.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('Min age must be less than max age.');
    expect(error.id).toBe(describedBy);
  });

  it('calls onChange with the patched field when the user edits it', () => {
    const onChange = vi.fn();
    render(<ProductThresholdForm productType="PERSONAL" rule={rule} errors={{}} onChange={onChange} />);
    const minAgeInput = screen.getByLabelText(/min age/i);
    fireEvent.change(minAgeInput, { target: { value: '25' } });
    expect(onChange).toHaveBeenLastCalledWith({ min_age: 25 });
  });

  it('renders required documents as read-only chips', () => {
    render(<ProductThresholdForm productType="PERSONAL" rule={rule} errors={{}} onChange={vi.fn()} />);
    expect(screen.getByText('ID_PROOF')).toBeInTheDocument();
    expect(screen.getByText('ADDRESS_PROOF')).toBeInTheDocument();
    expect(screen.getByText('SALARY_SLIP')).toBeInTheDocument();
  });
});
