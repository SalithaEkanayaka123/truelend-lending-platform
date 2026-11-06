import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QueueItem } from '../../types/apply';
import { QueueList } from './QueueList';

const ITEMS: QueueItem[] = [
  { document_id: 1, application_id: 10, type: 'ID_PROOF', uploaded_at: '2026-01-01T09:00:00Z' },
  { document_id: 2, application_id: 11, type: 'SALARY_SLIP', uploaded_at: '2026-01-02T09:00:00Z' },
];

describe('QueueList', () => {
  afterEach(cleanup);

  it('renders the same rows as a table and as cards (E2-S4-AC3)', () => {
    render(<QueueList items={ITEMS} onAction={vi.fn()} />);
    const table = screen.getByTestId('queue-table');
    const cards = screen.getByTestId('queue-cards');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
    expect(within(table).getByText('#11')).toBeInTheDocument();
    expect(within(cards).getByText(/Application #11/)).toBeInTheDocument();
  });

  it('reports the item and outcome for Verify and Reject (E2-S4-AC3)', async () => {
    const onAction = vi.fn();
    render(<QueueList items={ITEMS} onAction={onAction} />);
    const cards = within(screen.getByTestId('queue-cards'));
    await userEvent.click(cards.getByRole('button', { name: 'Verify Id proof for application 10' }));
    expect(onAction).toHaveBeenLastCalledWith(ITEMS[0], 'VERIFIED');
    await userEvent.click(within(screen.getByTestId('queue-table')).getByRole('button', { name: 'Reject Salary slip for application 11' }));
    expect(onAction).toHaveBeenLastCalledWith(ITEMS[1], 'REJECTED');
  });
});
