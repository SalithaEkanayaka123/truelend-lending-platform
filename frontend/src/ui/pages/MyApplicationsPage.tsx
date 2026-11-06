/** My applications (S-A-1). Built from the application ids this browser
 * remembers, because the API has no list endpoint yet (E5-S1). */

import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { formatRupees } from '../../service/formatMoney';
import { useMyApplications } from '../../service/useMyApplications';
import type { ApplicationDetail } from '../../types/review';
import controls from '../components/controls.module.css';
import { ErrorState } from '../components/ErrorState';
import { StatusBadge, statusLabel } from '../components/StatusBadge';
import styles from './MyApplicationsPage.module.css';

function ApplicationCard({ application }: { application: ApplicationDetail }): JSX.Element {
  return (
    <li>
      <Link to={`/applications/${application.id}`} className={styles.card}>
        <span className={styles.head}>
          <strong>{`Application #${application.id}`}</strong>
          <StatusBadge status={application.status} />
        </span>
        <span>{statusLabel(application.product_type)}</span>
        <span className={controls.muted}>{`${formatRupees(application.requested_amount)} over ${application.tenure_months} months`}</span>
      </Link>
    </li>
  );
}

function Empty(): JSX.Element {
  return (
    <div className={controls.empty}>
      <p>You have no applications yet.</p>
      <Link to="/apply" className={controls.primary}>
        Start an application
      </Link>
    </div>
  );
}

export function MyApplicationsPage(): JSX.Element {
  const { data, loading, error, reload } = useMyApplications();
  return (
    <main className={styles.main}>
      <header className={styles.top}>
        <h1 className={styles.title}>My applications</h1>
        <Link to="/apply" className={controls.primary}>
          New application
        </Link>
      </header>
      {loading ? <div className={controls.skeleton} aria-busy="true" aria-label="Loading applications" /> : null}
      {error ? <ErrorState message={error.message} correlationId={error.correlationId} onRetry={reload} /> : null}
      {data && data.length === 0 ? <Empty /> : null}
      {data && data.length > 0 ? (
        <ul className={styles.list}>
          {data.map((application) => (
            <ApplicationCard key={application.id} application={application} />
          ))}
        </ul>
      ) : null}
    </main>
  );
}
