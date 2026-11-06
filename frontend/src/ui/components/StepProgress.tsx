/** Progress indicator for the apply wizard (E2-S4-AC1): numbered steps with
 * the current one marked, plus a "Step n of 3" label for screen readers. */

import type { JSX } from 'react';

import styles from './StepProgress.module.css';

export const WIZARD_STEPS: readonly string[] = ['Product', 'Details', 'Documents and submit'];

export function StepProgress({ current }: { current: number }): JSX.Element {
  return (
    <nav aria-label="Application progress">
      <p className={styles.label}>{`Step ${current + 1} of ${WIZARD_STEPS.length}`}</p>
      <ol className={styles.steps}>
        {WIZARD_STEPS.map((name, index) => (
          <li
            key={name}
            className={`${styles.step} ${index === current ? styles.current : ''} ${index < current ? styles.done : ''}`}
            aria-current={index === current ? 'step' : undefined}
          >
            <span className={styles.dot} aria-hidden="true">
              {index < current ? '✓' : index + 1}
            </span>
            <span className={styles.name}>{name}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
