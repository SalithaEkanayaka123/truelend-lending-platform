/** Action panel of the review screen (ui_spec S-U-4): the manual-review form
 * (reason, Approve, Reject -- both disabled while the reason is empty) and the
 * override dialog (reason-code select plus comment; Submit disabled until both
 * are set). The buttons only collect input; the API decides. */

import { useState, type JSX } from 'react';

import type { ReviewError } from '../../service/useReview';
import type { ReviewOutcome } from '../../types/review';
import { Dialog } from './Dialog';
import { ErrorState } from './ErrorState';
import styles from './ReviewActions.module.css';

const MAX_REASON = 500;

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function TextField({ id, label, value, onChange }: TextFieldProps): JSX.Element {
  return (
    <>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className={styles.input}
        rows={3}
        maxLength={MAX_REASON}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}

function InlineError({ error }: { error: ReviewError | null }): JSX.Element | null {
  if (!error) return null;
  return <ErrorState message={error.message} correlationId={error.correlationId} />;
}

export interface ManualReviewFormProps {
  submitting: boolean;
  error: ReviewError | null;
  onSubmit: (outcome: ReviewOutcome, reason: string) => Promise<boolean>;
}

export function ManualReviewForm({ submitting, error, onSubmit }: ManualReviewFormProps): JSX.Element {
  const [reason, setReason] = useState('');
  const blocked = reason.trim() === '' || submitting;
  const send = (outcome: ReviewOutcome): void => {
    void onSubmit(outcome, reason.trim());
  };
  return (
    <section className={styles.card} aria-labelledby="manual-title">
      <h2 id="manual-title" className={styles.title}>
        Manual review
      </h2>
      <TextField id="review-reason" label="Reason" value={reason} onChange={setReason} />
      <InlineError error={error} />
      <div className={styles.buttons}>
        <button type="button" className={styles.approve} disabled={blocked} onClick={() => send('APPROVE')}>
          Approve
        </button>
        <button type="button" className={styles.reject} disabled={blocked} onClick={() => send('REJECT')}>
          Reject
        </button>
      </div>
    </section>
  );
}

interface CodeSelectProps {
  codes: string[];
  value: string;
  onChange: (value: string) => void;
}

function CodeSelect({ codes, value, onChange }: CodeSelectProps): JSX.Element {
  return (
    <>
      <label className={styles.label} htmlFor="override-code">
        Reason code
      </label>
      <select id="override-code" className={styles.input} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select a reason code</option>
        {codes.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
    </>
  );
}

export interface OverrideDialogProps {
  codes: string[];
  submitting: boolean;
  error: ReviewError | null;
  onSubmit: (reasonCode: string, comment: string) => Promise<boolean>;
  onClose: () => void;
}

export function OverrideDialog({ codes, submitting, error, onSubmit, onClose }: OverrideDialogProps): JSX.Element {
  const [code, setCode] = useState('');
  const [comment, setComment] = useState('');
  const incomplete = code === '' || comment.trim() === '' || submitting;
  const submit = (): void => {
    void onSubmit(code, comment.trim()).then((ok) => {
      if (ok) onClose();
    });
  };
  return (
    <Dialog title="Override decision" onClose={onClose} busy={submitting}>
      <CodeSelect codes={codes} value={code} onChange={setCode} />
      <TextField id="override-comment" label="Comment" value={comment} onChange={setComment} />
      <InlineError error={error} />
      <div className={styles.buttons}>
        <button type="button" className={styles.secondary} onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className={styles.approve} disabled={incomplete} onClick={submit}>
          Submit override
        </button>
      </div>
    </Dialog>
  );
}

export function OverrideSection({ onOpen }: { onOpen: () => void }): JSX.Element {
  return (
    <section className={styles.card} aria-labelledby="override-title">
      <h2 id="override-title" className={styles.title}>
        Auto-rejected
      </h2>
      <p className={styles.hint}>This application was rejected by policy. You can override it with a recorded reason.</p>
      <div className={styles.buttons}>
        <button type="button" className={styles.approve} onClick={onOpen}>
          Override
        </button>
      </div>
    </section>
  );
}
