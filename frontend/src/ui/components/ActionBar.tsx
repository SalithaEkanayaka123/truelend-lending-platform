/** Sticky action bar for the Policy editor: the unsaved-changes hint and the
 * Save button. Save stays disabled until something has changed, and while the
 * form has errors or a save is in flight. The hint is a polite live region
 * but deliberately not `role="status"`: the page's toast owns that role. */

import type { JSX } from 'react';

import styles from './ActionBar.module.css';

export interface ActionBarProps {
  changeCount: number;
  invalid: boolean;
  submitting: boolean;
}

function hintFor(changeCount: number, invalid: boolean): string {
  if (changeCount === 0) return 'No unsaved changes';
  const count = changeCount === 1 ? '1 unsaved change' : `${changeCount} unsaved changes`;
  return invalid ? `${count} · Fix the highlighted fields to save` : count;
}

export function ActionBar({ changeCount, invalid, submitting }: ActionBarProps): JSX.Element {
  const disabled = changeCount === 0 || invalid || submitting;
  return (
    <div className={styles.bar}>
      <p className={styles.hint} aria-live="polite" data-dirty={changeCount > 0 ? 'true' : undefined}>
        {hintFor(changeCount, invalid)}
      </p>
      <button type="submit" className={styles.save} disabled={disabled}>
        {submitting ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
