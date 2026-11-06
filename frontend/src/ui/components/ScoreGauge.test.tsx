import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScoreGauge } from './ScoreGauge';

describe('ScoreGauge', () => {
  afterEach(cleanup);

  it('shows the score and the policy thresholds', () => {
    render(<ScoreGauge score={680} autoRejectBelow={600} autoApproveMin={700} />);
    expect(screen.getByRole('img', { name: /credit score 680/i })).toBeInTheDocument();
    expect(screen.getByText('Reject below 600 · Approve from 700')).toBeInTheDocument();
  });

  it('omits thresholds the product does not define', () => {
    render(<ScoreGauge score={500} autoRejectBelow={null} autoApproveMin={null} />);
    expect(screen.queryByText(/reject below/i)).not.toBeInTheDocument();
  });
});
