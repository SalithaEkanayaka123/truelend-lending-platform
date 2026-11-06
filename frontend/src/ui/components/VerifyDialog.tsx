/** Reason dialog for the verification queue (S-U-2): Verify or Reject a
 * document with a reason of 1-500 characters and a live counter. The button
 * only collects input; the API decides. */

import { useId, useState, type JSX } from 'react';

import type { ReviewError } from '../../service/useReview';
import type { QueueItem, VerifyOutcome } from '../../types/apply';
import controls from './controls.module.css';
import { Dialog } from './Dialog';
import { ErrorState } from './ErrorState';
import { statusLabel } from './StatusBadge';
import styles from './VerifyDialog.module.css';

export const MAX_REASON = 500;

export interface VerifyDialogProps {
  item: QueueItem;
  outcome: VerifyOutcome;
  submitting: boolean;
  error: ReviewError | null;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}

function ReasonField({ value, onChange }: { value: string; onChange: (value: string) => void }): JSX.Element {
  const id = useId();
  return (
    <>
      <label className={controls.label} htmlFor={id}>
        Reason
      </label>
      <textarea
        id={id}
        className={`${controls.input} ${styles.area}`}
        rows={3}
        maxLength={MAX_REASON}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className={controls.hint} data-testid="reason-counter">{`${value.length}/${MAX_REASON}`}</p>
    </>
  );
}

export function VerifyDialog({ item, outcome, submitting, error, onSubmit, onClose }: VerifyDialogProps): JSX.Element {
  const [reason, setReason] = useState('');
  const verb = outcome === 'VERIFIED' ? 'Verify' : 'Reject';
  const blocked = reason.trim() === '' || submitting;
  return (
    <Dialog title={`${verb} ${statusLabel(item.type)}`} onClose={onClose} busy={submitting}>
      <ReasonField value={reason} onChange={setReason} />
      {error ? <ErrorState message={error.message} correlationId={error.correlationId} /> : null}
      <div className={styles.buttons}>
        <button type="button" className={controls.secondary} disabled={submitting} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={controls.primary} disabled={blocked} onClick={() => onSubmit(reason.trim())}>
          {`Confirm ${verb.toLowerCase()}`}
        </button>
      </div>
    </Dialog>
  );
}
