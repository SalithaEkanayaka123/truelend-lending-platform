import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../repository/apiClient';
import * as usePoliciesModule from '../../service/usePolicies';
import type { UsePoliciesResult } from '../../service/usePolicies';
import type { PolicyVersion, ProductRule } from '../../types/policy';
import { PolicyEditorPage } from './PolicyEditorPage';

vi.mock('../../service/usePolicies');

function firstOf(elements: HTMLElement[]): HTMLElement {
  const [element] = elements;
  if (!element) throw new Error('Expected at least one matching element.');
  return element;
}

function rule(overrides: Partial<ProductRule> = {}): ProductRule {
  return {
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
    ...overrides,
  };
}

function baseProducts(): ProductRule[] {
  return [rule({ product_type: 'PERSONAL' }), rule({ product_type: 'VEHICLE' }), rule({ product_type: 'EDUCATION' })];
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

function mockUsePolicies(overrides: Partial<UsePoliciesResult> = {}): void {
  const value: UsePoliciesResult = {
    products: baseProducts(),
    versions: [V1],
    baseVersion: 1,
    loading: false,
    error: null,
    createDraft: vi.fn(),
    ...overrides,
  };
  vi.mocked(usePoliciesModule.usePolicies).mockReturnValue(value);
}

describe('PolicyEditorPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the seeded version list with the approved v1 badge', () => {
    mockUsePolicies();
    render(<PolicyEditorPage />);
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('shows an inline error and disables Save when min_age >= max_age (E4-S2-AC2)', async () => {
    mockUsePolicies();
    const user = userEvent.setup();
    render(<PolicyEditorPage />);

    const minAge = firstOf(screen.getAllByLabelText(/min age/i));
    await user.clear(minAge);
    await user.type(minAge, '70');

    expect(await screen.findByText(/min age must be less than max age/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('shows a Draft v2 banner and the new version in the list after a successful save (E4-S2-AC3)', async () => {
    const created: PolicyVersion = {
      version: 2,
      status: 'DRAFT',
      base_version: 1,
      created_by: 1,
      created_at: '2026-01-02T00:00:00Z',
      approved_by: null,
      approved_at: null,
    };
    const createDraft = vi.fn().mockImplementation(() => {
      mockUsePolicies({ versions: [V1, created], createDraft });
      return Promise.resolve(created);
    });
    mockUsePolicies({ createDraft });
    const user = userEvent.setup();
    render(<PolicyEditorPage />);

    const minAge = firstOf(screen.getAllByLabelText(/min age/i));
    await user.clear(minAge);
    await user.type(minAge, '22');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/draft v2/i)).toBeInTheDocument();
    expect(await screen.findByText('v2')).toBeInTheDocument();
  });

  it('maps a 422 VALIDATION_ERROR response onto the named field', async () => {
    const createDraft = vi
      .fn()
      .mockRejectedValue(new ApiError('VALIDATION_ERROR', 'PERSONAL.max_age: Min age must be less than max age.'));
    mockUsePolicies({ createDraft });
    const user = userEvent.setup();
    render(<PolicyEditorPage />);

    const minAge = firstOf(screen.getAllByLabelText(/min age/i));
    await user.clear(minAge);
    await user.type(minAge, '22');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Min age must be less than max age.')).toBeInTheDocument();
  });
});
