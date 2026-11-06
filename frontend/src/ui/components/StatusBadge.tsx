/** Status pill (ui_spec §4.1): colour token + icon + text label, never colour
 * alone. Unknown statuses fall back to the muted tone with the raw label. */

import type { JSX } from 'react';

import styles from './StatusBadge.module.css';

type Tone = 'info' | 'warning' | 'success' | 'danger' | 'muted';

const TONE: Record<string, Tone> = {
  DRAFT: 'info',
  SUBMITTED: 'info',
  MANUAL_REVIEW: 'warning',
  APPROVED: 'success',
  VERIFIED: 'success',
  REJECTED: 'danger',
  MISSING: 'muted',
  UPLOADED: 'info',
};

const GLYPH: Record<Tone, string> = {
  info: 'M12 8v.01M12 12v5',
  warning: 'M12 7v6M12 17h.01',
  success: 'M5 12l5 5 9-10',
  danger: 'M7 7l10 10M17 7L7 17',
  muted: 'M6 12h12',
};

export function statusLabel(status: string): string {
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function StatusBadge({ status }: { status: string }): JSX.Element {
  const tone = TONE[status] ?? 'muted';
  return (
    <span className={`${styles.badge} ${styles[tone]}`} data-status={status}>
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
        <path d={GLYPH[tone]} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {statusLabel(status)}
    </span>
  );
}
