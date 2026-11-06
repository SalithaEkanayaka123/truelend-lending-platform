/** Modal dialog (ui_spec §9): `role="dialog"`, `aria-modal`, labelled by its
 * title; focus moves in on open, is trapped, and returns to the trigger on
 * close; Escape closes unless a request is in flight. A bottom sheet at xs,
 * a centred modal from md (CSS). */

import { useEffect, useId, useRef, type JSX, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import styles from './Dialog.module.css';

export interface DialogProps {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

function useFocusScope(panel: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, [panel]);
}

function trapTab(event: KeyboardEvent<HTMLDivElement>, panel: HTMLDivElement | null): void {
  const items = Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const edge = event.shiftKey ? first : last;
  if (document.activeElement === edge) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

export function Dialog({ title, onClose, busy = false, children }: DialogProps): JSX.Element {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useFocusScope(panel);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key === 'Tab') trapTab(event, panel.current);
  };

  return (
    <div className={styles.backdrop} onKeyDown={onKeyDown}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.panel}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
