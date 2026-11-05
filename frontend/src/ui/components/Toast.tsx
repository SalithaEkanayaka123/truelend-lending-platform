/** Success/failure toast (ui_spec §9). A success is a polite `status` that
 * dismisses itself after 5 s and pauses while hovered or focused; a failure
 * is an `alert` that stays until dismissed, so an error is never missed. */

import { useEffect, useState, type JSX } from 'react';

import styles from './Toast.module.css';

export interface ToastProps {
  kind: 'success' | 'error';
  message: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 5000;

function useAutoDismiss(active: boolean, onDismiss: () => void, resetKey: string): (paused: boolean) => void {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!active || paused) return undefined;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [active, paused, onDismiss, resetKey]);
  return setPaused;
}

function Glyph({ kind }: { kind: ToastProps['kind'] }): JSX.Element {
  const path = kind === 'success' ? 'M5 12l5 5 9-10' : 'M12 7v6M12 17h.01';
  return (
    <svg className={styles.glyph} viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Toast({ kind, message, onDismiss }: ToastProps): JSX.Element {
  const setPaused = useAutoDismiss(kind === 'success', onDismiss, message);
  return (
    <div
      role={kind === 'success' ? 'status' : 'alert'}
      className={`${styles.toast} ${kind === 'success' ? styles.success : styles.error}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Glyph kind={kind} />
      <span className={styles.message}>{message}</span>
      <button type="button" className={styles.dismiss} aria-label="Dismiss notification" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
