/** Full-page "No access" / "Not found" state (ui_spec section 7). Plain
 * language, never the raw status code; an optional button to the role's
 * landing screen. */

import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import styles from './FullPageState.module.css';

export interface FullPageStateProps {
  title: string;
  message: string;
  home?: { to: string; label: string };
}

export function FullPageState({ title, message, home }: FullPageStateProps): JSX.Element {
  return (
    <section className={styles.card}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{message}</p>
      {home ? (
        <Link to={home.to} className={styles.action}>
          {`Go to ${home.label}`}
        </Link>
      ) : null}
    </section>
  );
}
