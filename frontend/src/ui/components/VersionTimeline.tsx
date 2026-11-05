/** Policy versions as a vertical timeline: version label, status pill (text,
 * never colour alone), who approved or created it and when. The current
 * version is the highest APPROVED one (a newer draft is not current) and is
 * highlighted and marked `aria-current`. Newest first. */

import type { JSX } from 'react';

import type { PolicyVersion } from '../../types/policy';
import styles from './VersionTimeline.module.css';

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function currentVersionOf(versions: PolicyVersion[]): number | null {
  const approved = versions.filter((v) => v.status === 'APPROVED').map((v) => v.version);
  return approved.length === 0 ? null : Math.max(...approved);
}

function metaOf(v: PolicyVersion): string {
  if (v.status === 'APPROVED') {
    return `Approved by user #${v.approved_by ?? v.created_by} · ${formatWhen(v.approved_at ?? v.created_at)}`;
  }
  return `Created by user #${v.created_by} · ${formatWhen(v.created_at)}`;
}

function TimelineItem({ version, current }: { version: PolicyVersion; current: boolean }): JSX.Element {
  const approved = version.status === 'APPROVED';
  return (
    <li className={styles.item} data-current={current ? 'true' : undefined} aria-current={current ? 'true' : undefined}>
      <span className={styles.dot} aria-hidden="true" />
      <div className={styles.head}>
        <span className={styles.version}>{`v${version.version}`}</span>
        <span className={approved ? styles.pillApproved : styles.pillDraft}>{approved ? 'Approved' : 'Draft'}</span>
        {current ? <span className={styles.currentTag}>Current</span> : null}
      </div>
      <p className={styles.meta}>{metaOf(version)}</p>
    </li>
  );
}

export function VersionTimeline({ versions }: { versions: PolicyVersion[] }): JSX.Element {
  if (versions.length === 0) return <p className={styles.empty}>No policy versions.</p>;
  const current = currentVersionOf(versions);
  const newestFirst = [...versions].sort((a, b) => b.version - a.version);
  return (
    <ol className={styles.timeline}>
      {newestFirst.map((v) => (
        <TimelineItem key={v.version} version={v} current={v.version === current} />
      ))}
    </ol>
  );
}
