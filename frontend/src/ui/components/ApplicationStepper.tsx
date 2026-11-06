/** Status stepper of the applicant tracker (S-A-5): Submitted, Underwriting,
 * Decision, Disbursed, Repaying. The current step is highlighted; the step
 * comes from the stored status the API returned, never a local guess. */

import type { JSX } from 'react';

import type { ApplicationStatus } from '../../types/review';
import styles from './StepProgress.module.css';

export const TRACK_STEPS: readonly string[] = ['Submitted', 'Underwriting', 'Decision', 'Disbursed', 'Repaying'];

const CURRENT: Record<ApplicationStatus, number> = {
  DRAFT: -1,
  SUBMITTED: 0,
  MANUAL_REVIEW: 1,
  APPROVED: 2,
  REJECTED: 2,
};

export function trackIndex(status: ApplicationStatus): number {
  return CURRENT[status];
}

export function ApplicationStepper({ status }: { status: ApplicationStatus }): JSX.Element {
  const current = trackIndex(status);
  return (
    <nav aria-label="Application status">
      <ol className={styles.steps}>
        {TRACK_STEPS.map((name, index) => (
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
