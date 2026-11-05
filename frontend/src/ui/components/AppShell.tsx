/** Signed-in shell: top bar with the role's nav (only links the role can
 * open) and Sign out. Wraps below the `md` breakpoint instead of scrolling. */

import type { JSX, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { navFor } from '../../config/roleRoutes';
import type { Role } from '../../types/auth';
import styles from './AppShell.module.css';

export interface AppShellProps {
  role: Role;
  onSignOut: () => void;
  children: ReactNode;
}

export function AppShell({ role, onSignOut, children }: AppShellProps): JSX.Element {
  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <span className={styles.brand}>TrueLend</span>
        <nav aria-label="Main" className={styles.nav}>
          {navFor(role).map((item) => (
            <NavLink key={item.to} to={item.to} className={styles.link}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button type="button" className={styles.signOut} onClick={onSignOut}>
          Sign out
        </button>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
