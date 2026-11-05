import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an alert with the message, the correlation id and a Retry button', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState message="Could not load the catalog." correlationId="abc-123" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the catalog.');
    expect(screen.getByText(/abc-123/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the correlation id and Retry when none are given', () => {
    render(<ErrorState message="Something went wrong." />);
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument();
  });

  it('never renders a stack trace', () => {
    render(<ErrorState message="Boom" correlationId="id-1" onRetry={vi.fn()} />);
    expect(screen.queryByText(/at .*\(.*:\d+:\d+\)/)).not.toBeInTheDocument();
  });
});
