import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialog } from './Dialog';

describe('Dialog', () => {
  afterEach(cleanup);

  it('is a labelled modal that focuses its first control', () => {
    render(
      <Dialog title="Override decision" onClose={vi.fn()}>
        <button type="button">First</button>
      </Dialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Override decision' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('closes on Escape unless busy', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Dialog title="T" onClose={onClose}>
        <button type="button">A</button>
      </Dialog>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(
      <Dialog title="T" onClose={onClose} busy>
        <button type="button">A</button>
      </Dialog>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Tab inside the dialog', async () => {
    render(
      <Dialog title="T" onClose={vi.fn()}>
        <button type="button">A</button>
        <button type="button">B</button>
      </Dialog>,
    );
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'A' })).toHaveFocus();
  });
});
