/** Verification queue (S-U-2): documents waiting for an underwriter, as a table
 * on desktop and cards on mobile. Verify and Reject open a reason dialog; an
 * accepted decision removes the row without a reload. */

import { useState, type JSX } from 'react';

import { useVerificationQueue, type UseVerificationQueue } from '../../service/useVerificationQueue';
import type { QueueItem, VerifyOutcome } from '../../types/apply';
import controls from '../components/controls.module.css';
import { ErrorState } from '../components/ErrorState';
import { QueueList } from '../components/QueueList';
import { VerifyDialog } from '../components/VerifyDialog';
import styles from './VerificationPage.module.css';

interface Pending {
  item: QueueItem;
  outcome: VerifyOutcome;
}

function Dialogs({ pending, state, onClose }: { pending: Pending | null; state: UseVerificationQueue; onClose: () => void }): JSX.Element | null {
  if (!pending) return null;
  const submit = (reason: string): void => {
    void state.decide(pending.item, pending.outcome, reason).then((ok) => {
      if (ok) onClose();
    });
  };
  return (
    <VerifyDialog
      item={pending.item}
      outcome={pending.outcome}
      submitting={state.submitting}
      error={state.actionError}
      onSubmit={submit}
      onClose={onClose}
    />
  );
}

function Content({ state, onAction }: { state: UseVerificationQueue; onAction: (item: QueueItem, outcome: VerifyOutcome) => void }): JSX.Element | null {
  const { data, loading, error, reload } = state.queue;
  if (error) return <ErrorState message={error.message} correlationId={error.correlationId} onRetry={reload} />;
  if (loading && !data) return <div className={controls.skeleton} aria-busy="true" aria-label="Loading queue" />;
  if (!data) return null;
  if (data.items.length === 0) return <p className={controls.empty}>All documents are verified.</p>;
  return <QueueList items={data.items} onAction={onAction} />;
}

export function VerificationPage(): JSX.Element {
  const state = useVerificationQueue();
  const [pending, setPending] = useState<Pending | null>(null);
  const close = (): void => {
    setPending(null);
    state.clearError();
  };
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Verification queue</h1>
      <Content state={state} onAction={(item, outcome) => setPending({ item, outcome })} />
      <Dialogs pending={pending} state={state} onClose={close} />
    </main>
  );
}
