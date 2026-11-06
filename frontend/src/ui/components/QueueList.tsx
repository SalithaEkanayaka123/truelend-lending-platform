/** Verification queue list (S-U-2): a table and a stack of cards carry the same
 * rows. Both are in the DOM; CSS shows the table from md and the cards below
 * it. Verify and Reject only open the reason dialog; the API decides. */

import type { JSX } from 'react';

import type { QueueItem, VerifyOutcome } from '../../types/apply';
import controls from './controls.module.css';
import styles from './QueueList.module.css';
import { statusLabel } from './StatusBadge';

export interface QueueListProps {
  items: QueueItem[];
  onAction: (item: QueueItem, outcome: VerifyOutcome) => void;
}

function uploaded(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function Actions({ item, onAction }: { item: QueueItem; onAction: QueueListProps['onAction'] }): JSX.Element {
  const name = `${statusLabel(item.type)} for application ${item.application_id}`;
  return (
    <div className={styles.actions}>
      <button type="button" className={controls.primary} aria-label={`Verify ${name}`} onClick={() => onAction(item, 'VERIFIED')}>
        Verify
      </button>
      <button type="button" className={controls.danger} aria-label={`Reject ${name}`} onClick={() => onAction(item, 'REJECTED')}>
        Reject
      </button>
    </div>
  );
}

function QueueTable({ items, onAction }: QueueListProps): JSX.Element {
  return (
    <table className={styles.table} data-testid="queue-table">
      <thead>
        <tr>
          <th scope="col">Document</th>
          <th scope="col">Application</th>
          <th scope="col">Uploaded</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.document_id}>
            <td>{statusLabel(item.type)}</td>
            <td>{`#${item.application_id}`}</td>
            <td>{uploaded(item.uploaded_at)}</td>
            <td>
              <Actions item={item} onAction={onAction} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QueueCards({ items, onAction }: QueueListProps): JSX.Element {
  return (
    <ul className={styles.cards} data-testid="queue-cards">
      {items.map((item) => (
        <li key={item.document_id} className={styles.cardItem}>
          <p className={styles.cardTitle}>{statusLabel(item.type)}</p>
          <p className={controls.muted}>{`Application #${item.application_id} - uploaded ${uploaded(item.uploaded_at)}`}</p>
          <Actions item={item} onAction={onAction} />
        </li>
      ))}
    </ul>
  );
}

export function QueueList(props: QueueListProps): JSX.Element {
  return (
    <>
      <QueueTable {...props} />
      <QueueCards {...props} />
    </>
  );
}
