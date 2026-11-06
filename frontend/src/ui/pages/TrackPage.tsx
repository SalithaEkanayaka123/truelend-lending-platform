/** Applicant tracker (S-A-5) at /applications/:id for a CUSTOMER: status
 * stepper, the stored decision, and the document list with Upload for rows
 * that are missing or were rejected. A customer sees only their own
 * application; the API answers anything else with 404, shown as "Not found". */

import type { JSX } from 'react';
import { useParams } from 'react-router-dom';

import { useReview, type ReviewError, type UseReviewResult } from '../../service/useReview';
import { useUploadDocument } from '../../service/useUploadDocument';
import type { DocumentType } from '../../types/policy';
import type { ApplicationDetail } from '../../types/review';
import { ApplicationLoadError } from '../components/ApplicationLoadError';
import { ApplicationStepper } from '../components/ApplicationStepper';
import { DocumentRow, needsUpload } from '../components/DocumentsStep';
import documents from '../components/DocumentsStep.module.css';
import { ErrorState } from '../components/ErrorState';
import { DecisionPanel } from '../components/ReviewPanels';
import panels from '../components/ReviewPanels.module.css';
import { StatusBadge } from '../components/StatusBadge';
import styles from './TrackPage.module.css';

/** Customers get "Not found" for anything they cannot read, never "No access". */
function hideForbidden(error: ReviewError): ReviewError {
  return error.code === 'FORBIDDEN' ? { ...error, code: 'NOT_FOUND' } : error;
}

function DocumentList({ application, review }: { application: ApplicationDetail; review: UseReviewResult }): JSX.Element {
  const { upload, uploading, error } = useUploadDocument(application.id, review.reload);
  const pending = application.required_documents.some(needsUpload);
  return (
    <section className={panels.card} aria-labelledby="track-documents">
      <h2 id="track-documents" className={panels.title}>
        {pending ? 'Documents needed' : 'Documents'}
      </h2>
      <ul className={documents.list}>
        {application.required_documents.map((item) => (
          <DocumentRow key={item.document_id} item={item} busy={uploading} highlight={false} onUpload={(t: DocumentType) => void upload(t)} />
        ))}
      </ul>
      {error ? <ErrorState message={error.message} correlationId={error.correlationId} /> : null}
    </section>
  );
}

function Loaded({ application, review }: { application: ApplicationDetail; review: UseReviewResult }): JSX.Element {
  return (
    <>
      <header className={styles.head}>
        <h1>{`Application #${application.id}`}</h1>
        <StatusBadge status={application.status} />
      </header>
      <ApplicationStepper status={application.status} />
      <div className={styles.grid}>
        <DecisionPanel decision={review.decision} />
        <DocumentList application={application} review={review} />
      </div>
    </>
  );
}

export function TrackPage(): JSX.Element {
  const id = Number(useParams().id);
  const review = useReview(id);
  const { loadError, application } = review;
  return (
    <main className={styles.main}>
      {loadError ? <ApplicationLoadError error={hideForbidden(loadError)} onRetry={review.reload} /> : null}
      {!loadError && application ? <Loaded application={application} review={review} /> : null}
      {!loadError && !application ? <p aria-busy="true">Loading application…</p> : null}
    </main>
  );
}
