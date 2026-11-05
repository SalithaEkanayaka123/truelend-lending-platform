/** Inline/page error card (ui_spec section 7): plain message, the envelope's
 * `correlation_id` in small muted text with a Copy button, and a Retry
 * button. Never renders a stack trace. */

import type { JSX } from 'react';

import styles from './ErrorState.module.css';

export interface ErrorStateProps {
  message: string;
  correlationId?: string | null;
  onRetry?: () => void;
}

function copyReference(value: string): void {
  void navigator.clipboard?.writeText(value);
}

export function ErrorState({ message, correlationId, onRetry }: ErrorStateProps): JSX.Element {
  return (
    <section role="alert" className={styles.card}>
      <p className={styles.message}>{message}</p>
      {correlationId ? (
        <p className={styles.reference}>
          Reference: <span className={styles.mono}>{correlationId}</span>{' '}
          <button type="button" className={styles.link} onClick={() => copyReference(correlationId)}>
            Copy
          </button>
        </p>
      ) : null}
      {onRetry ? (
        <button type="button" className={styles.retry} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </section>
  );
}
