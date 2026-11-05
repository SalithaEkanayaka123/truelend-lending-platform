import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as usePoliciesModule from '../../service/usePolicies';
import type { UsePoliciesResult } from '../../service/usePolicies';
import type { PolicyVersion, ProductRule } from '../../types/policy';
import { PolicyEditorPage } from './PolicyEditorPage';

vi.mock('../../service/usePolicies');

function rule(productType: ProductRule['product_type']): ProductRule {
  return {
    product_type: productType,
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
}

const V1: PolicyVersion = {
  version: 1,
  status: 'APPROVED',
  base_version: null,
  created_by: 1,
  created_at: '2026-01-01T00:00:00Z',
  approved_by: 1,
  approved_at: '2026-01-01T00:00:00Z',
};

const V2: PolicyVersion = { ...V1, version: 2, status: 'DRAFT', base_version: 1, approved_by: null, approved_at: null };

function mockPolicies(createDraft = vi.fn().mockResolvedValue(V2)): void {
  const value: UsePoliciesResult = {
    products: [rule('PERSONAL'), rule('VEHICLE'), rule('EDUCATION')],
    versions: [V1],
    baseVersion: 1,
    loading: false,
    error: null,
    loadError: null,
    reload: vi.fn(),
    createDraft,
  };
  vi.mocked(usePoliciesModule.usePolicies).mockReturnValue(value);
}

function input(id: string): HTMLInputElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLInputElement)) throw new Error(`#${id} not found`);
  return el;
}

describe('PolicyEditorPage polish', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows one collapsible card per product, Personal open and the others closed', () => {
    mockPolicies();
    render(<PolicyEditorPage />);
    expect(screen.getByRole('button', { name: /personal/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /vehicle/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /education/i })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByText(/12\.00% p\.a\./)).toHaveLength(3);
  });

  it('keeps Save disabled with no changes, then enables it and counts the change', () => {
    mockPolicies();
    render(<PolicyEditorPage />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();

    fireEvent.change(input('PERSONAL-min_age'), { target: { value: '22' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
  });

  it('opens a closed card and counts its issues when an edit in it is invalid', () => {
    mockPolicies();
    render(<PolicyEditorPage />);
    expect(screen.getByRole('button', { name: /vehicle/i })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input('VEHICLE-min_age'), { target: { value: '90' } });

    expect(screen.getByRole('button', { name: /vehicle/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1 issue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows a success toast with the new draft, then goes back to no unsaved changes', async () => {
    mockPolicies();
    const user = userEvent.setup();
    render(<PolicyEditorPage />);

    fireEvent.change(input('PERSONAL-min_age'), { target: { value: '22' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const toast = await screen.findByRole('status');
    expect(within(toast).getByText('Draft v2')).toBeInTheDocument();
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();

    await user.click(within(toast).getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a failure toast and keeps the changes when the save fails', async () => {
    mockPolicies(vi.fn().mockRejectedValue(new Error('Server unavailable.')));
    const user = userEvent.setup();
    render(<PolicyEditorPage />);

    fireEvent.change(input('PERSONAL-min_age'), { target: { value: '22' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable.');
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
  });

  it('lists versions as a timeline with the current one highlighted', () => {
    mockPolicies();
    render(<PolicyEditorPage />);
    const current = screen.getByRole('listitem', { current: true });
    expect(within(current).getByText('v1')).toBeInTheDocument();
    expect(within(current).getByText('Current')).toBeInTheDocument();
  });

  it('has a single level-one heading', () => {
    mockPolicies();
    render(<PolicyEditorPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
