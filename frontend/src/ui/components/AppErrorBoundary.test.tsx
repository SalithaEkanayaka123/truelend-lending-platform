import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from './AppErrorBoundary';

let shouldThrow = true;

function Bomb(): JSX.Element {
  if (shouldThrow) throw new Error('render exploded');
  return <p>recovered content</p>;
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows Retry and Sign out instead of a blank page when a child throws', () => {
    render(
      <AppErrorBoundary onSignOut={vi.fn()}>
        <Bomb />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByText(/render exploded/)).not.toBeInTheDocument();
  });

  it('Retry re-renders the children', async () => {
    const user = userEvent.setup();
    render(
      <AppErrorBoundary onSignOut={vi.fn()}>
        <Bomb />
      </AppErrorBoundary>,
    );
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(screen.getByText('recovered content')).toBeInTheDocument();
  });

  it('Sign out calls onSignOut', async () => {
    const onSignOut = vi.fn();
    const user = userEvent.setup();
    render(
      <AppErrorBoundary onSignOut={onSignOut}>
        <Bomb />
      </AppErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
