import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApplicationLoadError } from './ApplicationLoadError';

function show(code: string, onRetry = vi.fn()): void {
  render(
    <MemoryRouter>
      <ApplicationLoadError error={{ code, message: 'Boom', correlationId: 'cid-1' }} onRetry={onRetry} />
    </MemoryRouter>,
  );
}

describe('ApplicationLoadError', () => {
  afterEach(cleanup);

  it('shows Not found for NOT_FOUND (E2-S4-AC4)', () => {
    show('NOT_FOUND');
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeInTheDocument();
  });

  it('shows No access for FORBIDDEN', () => {
    show('FORBIDDEN');
    expect(screen.getByRole('heading', { name: 'No access' })).toBeInTheDocument();
  });

  it('shows a retryable error with the reference otherwise', async () => {
    const onRetry = vi.fn();
    show('SERVER', onRetry);
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    expect(screen.getByText(/cid-1/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
