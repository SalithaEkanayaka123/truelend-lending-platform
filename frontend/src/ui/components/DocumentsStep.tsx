/** Apply step 3 (S-A-4): the product's document checklist. Each row is
 * Missing or Uploaded and has a stub Upload button. Submit stays disabled
 * until every row is Uploaded or Verified; on MISSING_DOCUMENTS the missing
 * rows are highlighted. */

import type { JSX } from 'react';

import type { DocumentType } from '../../types/policy';
import type { ApplicationDetail, ChecklistItem } from '../../types/review';
import controls from './controls.module.css';
import styles from './DocumentsStep.module.css';
import { StatusBadge, statusLabel } from './StatusBadge';

export interface DocumentsStepProps {
  application: ApplicationDetail;
  busy: boolean;
  highlightMissing: boolean;
  onUpload: (type: DocumentType) => void;
  onSubmit: () => void;
}

/** Rows that still need a file: nothing there yet, or the verifier rejected it. */
export function needsUpload(item: ChecklistItem): boolean {
  return item.status === 'MISSING' || item.status === 'REJECTED';
}

interface RowProps {
  item: ChecklistItem;
  busy: boolean;
  highlight: boolean;
  onUpload: (type: DocumentType) => void;
}

export function DocumentRow({ item, busy, highlight, onUpload }: RowProps): JSX.Element {
  const name = statusLabel(item.type);
  return (
    <li className={`${styles.row} ${highlight ? styles.highlight : ''}`} data-highlight={highlight ? 'true' : undefined}>
      <span className={styles.name}>{name}</span>
      <StatusBadge status={item.status} />
      {needsUpload(item) ? (
        <button
          type="button"
          className={controls.secondary}
          disabled={busy}
          aria-label={`Upload ${name}`}
          onClick={() => onUpload(item.type as DocumentType)}
        >
          Upload
        </button>
      ) : null}
      {item.status === 'REJECTED' && item.reason ? <p className={styles.reason}>{item.reason}</p> : null}
    </li>
  );
}

export function DocumentsStep({ application, busy, highlightMissing, onUpload, onSubmit }: DocumentsStepProps): JSX.Element {
  const rows = application.required_documents;
  const ready = rows.every((item) => !needsUpload(item));
  return (
    <section aria-labelledby="documents-step-title" className={styles.wrap}>
      <h2 id="documents-step-title" className={controls.title}>
        Upload your documents
      </h2>
      <p className={controls.muted}>Demo mode: choosing Upload records the document without sending a file.</p>
      <ul className={styles.list}>
        {rows.map((item) => (
          <DocumentRow
            key={item.document_id}
            item={item}
            busy={busy}
            highlight={highlightMissing && item.status === 'MISSING'}
            onUpload={onUpload}
          />
        ))}
      </ul>
      <button type="button" className={controls.primary} disabled={!ready || busy} onClick={onSubmit}>
        Submit application
      </button>
    </section>
  );
}
