import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ApplicationStepper, trackIndex } from './ApplicationStepper';

describe('ApplicationStepper', () => {
  afterEach(cleanup);

  it('lists the five steps (E2-S4-AC4)', () => {
    render(<ApplicationStepper status="SUBMITTED" />);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.replace(/^\S?\d?/, ''))).toHaveLength(5);
    expect(screen.getByText('Repaying')).toBeInTheDocument();
  });

  it('marks the current step from the status (E2-S4-AC4)', () => {
    render(<ApplicationStepper status="MANUAL_REVIEW" />);
    const current = screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Underwriting');
  });

  it('maps decided statuses to Decision and a draft to no step', () => {
    expect(trackIndex('APPROVED')).toBe(2);
    expect(trackIndex('REJECTED')).toBe(2);
    expect(trackIndex('DRAFT')).toBe(-1);
  });
});
