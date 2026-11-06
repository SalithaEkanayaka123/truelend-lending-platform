/** Read-only panels of the review screen (ui_spec S-U-4): applicant details
 * with masked identifiers, the document checklist, and the stored decision. */

import type { JSX } from 'react';

import { formatRupees } from '../../service/formatMoney';
import type { ApplicationDetail, DecisionDetail } from '../../types/review';
import styles from './ReviewPanels.module.css';
import { ScoreGauge } from './ScoreGauge';
import { StatusBadge, statusLabel } from './StatusBadge';

export function ApplicantPanel({ application }: { application: ApplicationDetail }): JSX.Element {
  const rows: [string, string][] = [
    ['Product', statusLabel(application.product_type)],
    ['Requested amount', formatRupees(application.requested_amount)],
    ['Tenure', `${application.tenure_months} months`],
    ['Age', `${application.age_years} years`],
    ['Monthly income', formatRupees(application.monthly_income)],
    ['PAN', application.pan_masked],
    ['Aadhaar', application.aadhaar_masked],
  ];
  return (
    <section className={styles.card} aria-labelledby="applicant-title">
      <h2 id="applicant-title" className={styles.title}>
        Applicant
      </h2>
      <dl className={styles.facts}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.fact}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function DocumentsPanel({ application }: { application: ApplicationDetail }): JSX.Element {
  return (
    <section className={styles.card} aria-labelledby="documents-title">
      <h2 id="documents-title" className={styles.title}>
        Documents
      </h2>
      <ul className={styles.documents}>
        {application.required_documents.map((doc) => (
          <li key={doc.document_id} className={styles.document}>
            <span>{statusLabel(doc.type)}</span>
            <StatusBadge status={doc.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Resolved({ decision }: { decision: DecisionDetail }): JSX.Element | null {
  const resolution = decision.resolution;
  if (!resolution) return null;
  const kind = resolution.kind === 'OVERRIDE' ? 'Override' : 'Manual review';
  return (
    <p className={styles.resolution} data-testid="resolution">
      {`${kind}: ${statusLabel(resolution.outcome)}. ${resolution.comment}`}
    </p>
  );
}

function DecisionBody({ decision }: { decision: DecisionDetail }): JSX.Element {
  const { auto_reject_below_score: reject, auto_approve_min_score: approve } = decision.thresholds;
  return (
    <>
      <ScoreGauge score={decision.score} autoRejectBelow={reject} autoApproveMin={approve} />
      <p className={styles.muted}>{`${statusLabel(decision.decision)} under policy v${decision.policy_version}`}</p>
      <ul className={styles.reasons}>
        {decision.reason_codes.map((reason) => (
          <li key={reason.code}>
            <strong className={styles.code}>{reason.code}</strong>
            <span>{reason.message}</span>
          </li>
        ))}
      </ul>
      <Resolved decision={decision} />
    </>
  );
}

export function DecisionPanel({ decision }: { decision: DecisionDetail | null }): JSX.Element {
  return (
    <section className={styles.card} aria-labelledby="decision-title">
      <h2 id="decision-title" className={styles.title}>
        Decision
      </h2>
      {decision ? <DecisionBody decision={decision} /> : <p className={styles.muted}>Not underwritten yet.</p>}
    </section>
  );
}
