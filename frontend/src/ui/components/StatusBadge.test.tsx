import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatusBadge, statusLabel } from './StatusBadge';

describe('StatusBadge', () => {
  afterEach(cleanup);

  it('writes the status in plain words', () => {
    expect(statusLabel('MANUAL_REVIEW')).toBe('Manual review');
    render(<StatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toHaveAttribute('data-status', 'APPROVED');
  });

  it('falls back to a muted badge for an unknown status', () => {
    render(<StatusBadge status="MYSTERY" />);
    expect(screen.getByText('Mystery')).toBeInTheDocument();
  });
});
