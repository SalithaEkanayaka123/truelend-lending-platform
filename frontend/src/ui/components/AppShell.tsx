/** Signed-in shell: branded header (logo mark + name), the main nav (only
 * links the role can open, with an active state), the signed-in user's name
 * and role badge, and Sign out. A skip link comes first in tab order
 * (ui_spec §10). The content area is centred at --content-max. */

import type { JSX, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

import { ROLE_LABEL, navFor } from '../../config/roleRoutes';
import type { Role } from '../../types/auth';
import styles from './AppShell.module.css';
import { BrandMark } from './icons';

export interface AppShellProps {
  role: Role;
  userName: string;
  onSignOut: () => void;
  children: ReactNode;
}

function MainNav({ role }: { role: Role }): JSX.Element {
  return (
    <nav aria-label="Main" className={styles.nav}>
      {navFor(role).map((item) => (
        <NavLink key={item.to} to={item.to} className={styles.link}>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function UserChip({ role, userName }: { role: Role; userName: string }): JSX.Element {
  return (
    <div className={styles.user}>
      <span className={styles.avatar} aria-hidden="true">
        {userName.charAt(0).toUpperCase()}
      </span>
      <span className={styles.userText}>
        <span className={styles.userName}>{userName}</span>
        <span className={styles.roleBadge}>{ROLE_LABEL[role]}</span>
      </span>
    </div>
  );
}

export function AppShell({ role, userName, onSignOut, children }: AppShellProps): JSX.Element {
  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#content">
        Skip to content
      </a>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <span className={styles.brand}>
            <BrandMark />
            <span className={styles.brandName}>TrueLend</span>
          </span>
          <MainNav role={role} />
          <UserChip role={role} userName={userName} />
          <button type="button" className={styles.signOut} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <div id="content" tabIndex={-1} className={styles.content}>
        {children}
      </div>
    </div>
  );
}
