/** Role -> route policy for the UI shell (specs/ui_spec.md sections 2 and 3.5).
 * Presentation only: the API stays the authority on every request. Only
 * screens that are built appear here; a nav entry for a screen that has not
 * shipped stays hidden (ui_spec section 3). */

import type { Role } from '../types/auth';

export interface NavItem {
  label: string;
  to: string;
}

const HOME_PATH = '/home';
const POLICIES_PATH = '/policies';

const POLICY_ROLES: readonly Role[] = ['POLICY_EDITOR', 'ADMIN'];

/** Name of each role's landing screen (ui_spec section 2). */
export const LANDING_NAME: Record<Role, string> = {
  CUSTOMER: 'My applications',
  UNDERWRITER: 'Work queue',
  ADMIN: 'Portfolio dashboard',
  POLICY_EDITOR: 'Policy editor',
};

const ROUTE_ROLES: Record<string, readonly Role[] | 'ALL'> = {
  [HOME_PATH]: 'ALL',
  [POLICIES_PATH]: POLICY_ROLES,
};

/** Where a role lands after sign-in. The policy editor's landing screen is
 * built; the other roles' landing screens arrive with their stories, so they
 * land on the role-aware home until then. */
export function landingPath(role: Role): string {
  return role === 'POLICY_EDITOR' ? POLICIES_PATH : HOME_PATH;
}

export function canOpen(role: Role, path: string): boolean {
  const allowed = ROUTE_ROLES[path];
  if (allowed === undefined) return false;
  return allowed === 'ALL' || allowed.includes(role);
}

export function navFor(role: Role): NavItem[] {
  const items: NavItem[] = [{ label: 'Home', to: HOME_PATH }];
  if (canOpen(role, POLICIES_PATH)) items.push({ label: 'Policies', to: POLICIES_PATH });
  return items;
}
