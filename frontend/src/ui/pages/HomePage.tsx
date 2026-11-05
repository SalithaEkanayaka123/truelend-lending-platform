/** Role-aware home. Each role sees its own landing name (ui_spec section 2).
 * The role's full landing screen arrives with its story; until then this
 * page says so plainly instead of linking to a screen that does not exist. */

import type { JSX } from 'react';

import { LANDING_NAME } from '../../config/roleRoutes';
import type { Role } from '../../types/auth';
import styles from './HomePage.module.css';

export function HomePage({ role }: { role: Role }): JSX.Element {
  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <h1 className={styles.title}>{LANDING_NAME[role]}</h1>
        <p className={styles.note}>This screen has not been built yet. Use the menu above for what is available.</p>
      </section>
    </main>
  );
}
