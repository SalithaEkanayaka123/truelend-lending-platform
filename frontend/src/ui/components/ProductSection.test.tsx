import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import type { ProductRule } from '../../types/policy';
import { ProductSection } from './ProductSection';

const rule: ProductRule = {
  product_type: 'VEHICLE',
  policy_version: 1,
  min_age: 21,
  max_age: 65,
  min_income: '30000.00',
  min_tenure_months: 12,
  max_tenure_months: 84,
  min_amount: '100000.00',
  max_amount: '2000000.00',
  annual_rate_pct: '10.50',
  auto_reject_below_score: 620,
  auto_approve_min_score: 710,
  required_documents: [],
};

function renderSection(props: { defaultOpen?: boolean; errorCount?: number } = {}): void {
  render(
    <ProductSection productType="VEHICLE" rule={rule} errorCount={props.errorCount ?? 0} defaultOpen={props.defaultOpen ?? false}>
      <label>
        Inner field
        <input />
      </label>
    </ProductSection>,
  );
}

describe('ProductSection', () => {
  afterEach(() => {
    cleanup();
  });

  it('names its heading after the product and summarises rate and amount range', () => {
    renderSection();
    expect(screen.getByRole('heading', { level: 2, name: 'Vehicle' })).toBeInTheDocument();
    expect(screen.getByText(/10\.50% p\.a\./)).toBeInTheDocument();
    expect(screen.getByText(/₹100,000\.00 – ₹2,000,000\.00/)).toBeInTheDocument();
  });

  it('is collapsed by default, with the content still in the document', () => {
    renderSection();
    const toggle = screen.getByRole('button', { name: /vehicle/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Inner field').closest('[hidden]')).not.toBeNull();
  });

  it('opens and closes from the toggle', async () => {
    renderSection();
    const user = userEvent.setup();
    const toggle = screen.getByRole('button', { name: /vehicle/i });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Inner field').closest('[hidden]')).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts open when asked to', () => {
    renderSection({ defaultOpen: true });
    expect(screen.getByRole('button', { name: /vehicle/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('stays open and counts the problems while the section has errors', async () => {
    renderSection({ errorCount: 2 });
    const toggle = screen.getByRole('button', { name: /vehicle/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('2 issues')).toBeInTheDocument();
    await userEvent.setup().click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('says "1 issue" in the singular', () => {
    renderSection({ errorCount: 1 });
    expect(screen.getByText('1 issue')).toBeInTheDocument();
  });
});
