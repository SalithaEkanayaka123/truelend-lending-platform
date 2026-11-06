import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { PolicyVersion } from '../../types/policy';
import { VersionTimeline } from './VersionTimeline';

const V1: PolicyVersion = {
  version: 1,
  status: 'APPROVED',
  base_version: null,
  created_by: 1,
  created_at: '2026-01-01T00:00:00Z',
  approved_by: 1,
  approved_at: '2026-01-01T00:00:00Z',
};
const V2: PolicyVersion = { ...V1, version: 2, status: 'DRAFT', base_version: 1, created_by: 2, approved_by: null, approved_at: null };
const V3: PolicyVersion = { ...V1, version: 3, approved_by: 1, approved_at: '2026-02-01T00:00:00Z' };

function items(): HTMLElement[] {
  return screen.getAllByRole('listitem');
}

describe('VersionTimeline', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows an empty message when there are no versions', () => {
    render(<VersionTimeline versions={[]} />);
    expect(screen.getByText('No policy versions.')).toBeInTheDocument();
  });

  it('shows each version label and status pill as its own text', () => {
    render(<VersionTimeline versions={[V2, V1]} />);
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('names who approved or created it, and when', () => {
    render(<VersionTimeline versions={[V2, V1]} />);
    const [draft, approved] = items();
    expect(within(draft as HTMLElement).getByText(/created by user #2/i)).toBeInTheDocument();
    expect(within(approved as HTMLElement).getByText(/approved by user #1/i)).toBeInTheDocument();
    expect(within(approved as HTMLElement).getByText(/2026/)).toBeInTheDocument();
  });

  it('shows display names for the creator and approver when the server sends them', () => {
    const named: PolicyVersion = { ...V1, created_by_name: 'Arjun Mehta', approved_by_name: 'Arjun Mehta' };
    const draft: PolicyVersion = { ...V2, created_by_name: 'Meera Iyer' };
    render(<VersionTimeline versions={[draft, named]} />);
    const [draftItem, approvedItem] = items();
    expect(within(draftItem as HTMLElement).getByText(/created by meera iyer/i)).toBeInTheDocument();
    expect(within(approvedItem as HTMLElement).getByText(/approved by arjun mehta/i)).toBeInTheDocument();
    expect(screen.queryByText(/user #/i)).not.toBeInTheDocument();
  });

  it('highlights the current version: the highest approved one, not a newer draft', () => {
    render(<VersionTimeline versions={[V3, V2, V1]} />);
    const current = items().filter((li) => li.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(within(current[0] as HTMLElement).getByText('v3')).toBeInTheDocument();
    expect(within(current[0] as HTMLElement).getByText('Current')).toBeInTheDocument();
  });

  it('highlights nothing when no version is approved', () => {
    render(<VersionTimeline versions={[V2]} />);
    expect(screen.queryByText('Current')).not.toBeInTheDocument();
  });

  it('shows the draft pill with text, not colour alone', () => {
    render(<VersionTimeline versions={[V2]} />);
    expect(screen.getByText('Draft')).toBeVisible();
  });
});
