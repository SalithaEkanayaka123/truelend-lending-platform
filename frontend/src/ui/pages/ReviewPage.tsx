/** Application review screen (S-U-4): applicant, documents and decision
 * panels, plus the actions the role and the stored status allow. Every
 * outcome shown is what the API returned. */

import { useState, type JSX } from 'react';
import { useParams } from 'react-router-dom';

import { useDismissable } from '../../service/useDismissable';
import { useReview, type UseReviewResult } from '../../service/useReview';
import type { Role } from '../../types/auth';
import { ErrorState } from '../components/ErrorState';
import { FullPageState } from '../components/FullPageState';
import { ManualReviewForm, OverrideDialog, OverrideSection } from '../components/ReviewActions';
import { ApplicantPanel, DecisionPanel, DocumentsPanel } from '../components/ReviewPanels';
import { StatusBadge } from '../components/StatusBadge';
import { Toast } from '../components/Toast';
import styles from './ReviewPage.module.css';

type Finish = (done: Promise<boolean>, text: string) => Promise<boolean>;

function ReviewForm({ review, finish }: { review: UseReviewResult; finish: Finish }): JSX.Element {
  return (
    <ManualReviewForm
      submitting={review.submitting}
      error={review.actionError}
      onSubmit={(outcome, reason) => finish(review.review(outcome, reason), `Review recorded: ${outcome.toLowerCase()}d.`)}
    />
  );
}

function OverrideFlow({ review, finish }: { review: UseReviewResult; finish: Finish }): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const decision = review.decision;
  if (!decision) return null;
  return (
    <>
      <OverrideSection onOpen={() => setOpen(true)} />
      {open ? (
        <OverrideDialog
          codes={decision.override_reason_codes}
          submitting={review.submitting}
          error={review.actionError}
          onSubmit={(code, comment) =>
            finish(review.override(code, comment), 'Override recorded. The application is approved.')
          }
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function Actions({ role, review }: { role: Role; review: UseReviewResult }): JSX.Element {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [message, dismiss] = useDismissable(confirmation);
  const { application, decision } = review;
  const canReview = role === 'UNDERWRITER' && application?.status === 'MANUAL_REVIEW';
  const canOverride = decision?.decision === 'AUTO_REJECT' && decision.resolution === null;
  const finish: Finish = async (done, text) => {
    const ok = await done;
    if (ok) setConfirmation(text);
    return ok;
  };
  return (
    <>
      {canReview ? <ReviewForm review={review} finish={finish} /> : null}
      {canOverride ? <OverrideFlow review={review} finish={finish} /> : null}
      {message ? (
        <div className={styles.toasts}>
          <Toast kind="success" message={message} onDismiss={dismiss} />
        </div>
      ) : null}
    </>
  );
}

function Loaded({ role, review, id }: { role: Role; review: UseReviewResult; id: number }): JSX.Element {
  const { application, decision } = review;
  if (!application) return <p aria-busy="true">Loading application…</p>;
  return (
    <>
      <header className={styles.head}>
        <h1>{`Application #${id}`}</h1>
        <StatusBadge status={application.status} />
      </header>
      <div className={styles.grid}>
        <ApplicantPanel application={application} />
        <DocumentsPanel application={application} />
        <DecisionPanel decision={decision} />
      </div>
      <div className={styles.actions}>
        <Actions role={role} review={review} />
      </div>
    </>
  );
}

function Failed({ review }: { review: UseReviewResult }): JSX.Element {
  const error = review.loadError;
  if (error?.code === 'NOT_FOUND') {
    return <FullPageState title="Not found" message="We could not find that application." />;
  }
  if (error?.code === 'FORBIDDEN') {
    return <FullPageState title="No access" message="Your role cannot open this application." />;
  }
  return <ErrorState message={error?.message ?? ''} correlationId={error?.correlationId} onRetry={review.reload} />;
}

export function ReviewPage({ role }: { role: Role }): JSX.Element {
  const id = Number(useParams().id);
  const review = useReview(id);
  return (
    <main className={styles.main}>
      {review.loadError ? <Failed review={review} /> : <Loaded role={role} review={review} id={id} />}
    </main>
  );
}
