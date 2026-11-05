import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toast } from './Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('announces a success as a status with the message as its own element', () => {
    render(<Toast kind="success" message="Draft v2" onDismiss={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Draft v2')).toBeInTheDocument();
  });

  it('announces a failure as an alert', () => {
    render(<Toast kind="error" message="Could not save." onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.');
  });

  it('dismisses a success by itself after 5 seconds', () => {
    const onDismiss = vi.fn();
    render(<Toast kind="success" message="Draft v2" onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps a failure until the user dismisses it', () => {
    const onDismiss = vi.fn();
    render(<Toast kind="error" message="Could not save." onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('pauses the timer while hovered and resumes on leave', () => {
    const onDismiss = vi.fn();
    render(<Toast kind="success" message="Draft v2" onDismiss={onDismiss} />);
    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has a Dismiss button', async () => {
    vi.useRealTimers();
    const onDismiss = vi.fn();
    render(<Toast kind="error" message="Could not save." onDismiss={onDismiss} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
