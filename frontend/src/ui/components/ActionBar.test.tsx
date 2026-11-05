import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ActionBar } from './ActionBar';

function renderBar(props: { changeCount: number; invalid?: boolean; submitting?: boolean }): void {
  render(
    <form>
      <ActionBar changeCount={props.changeCount} invalid={props.invalid ?? false} submitting={props.submitting ?? false} />
    </form>,
  );
}

describe('ActionBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('disables Save until something has changed', () => {
    renderBar({ changeCount: 0 });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('No unsaved changes')).toBeInTheDocument();
  });

  it.each([
    [1, '1 unsaved change'],
    [3, '3 unsaved changes'],
  ])('with %i change(s) enables Save and says "%s"', (count, hint) => {
    renderBar({ changeCount: count });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByText(hint)).toBeInTheDocument();
  });

  it('keeps Save disabled while the form has errors, and says why', () => {
    renderBar({ changeCount: 2, invalid: true });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText(/fix the highlighted fields/i)).toBeInTheDocument();
  });

  it('shows Saving… and stays disabled while a save is in flight', () => {
    renderBar({ changeCount: 2, submitting: true });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('is a submit button, announced politely, without claiming role status', () => {
    renderBar({ changeCount: 1 });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('1 unsaved change').closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });
});
