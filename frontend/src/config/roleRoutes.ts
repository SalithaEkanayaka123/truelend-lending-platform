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

/** Route pattern for the application review screen (S-U-4). The applicant's
 * own view (S-A-5) is not built yet, so CUSTOMER has no access to it here. */
export const APPLICATION_ROUTE = '/applications/:id';
const APPLICATION_PATH = /^\/applications\/[^/]+$/;

const POLICY_ROLES: readonly Role[] = ['POLICY_EDITOR', 'ADMIN'];
const REVIEW_ROLES: readonly Role[] = ['UNDERWRITER', 'ADMIN'];

/** Name of each role's landing screen (ui_spec section 2). */
export const LANDING_NAME: Record<Role, string> = {
  CUSTOMER: 'My applications',
  UNDERWRITER: 'Work queue',
  ADMIN: 'Portfolio dashboard',
  POLICY_EDITOR: 'Policy editor',
};

/** Plain-words role name for badges (ui_spec §2 calls CUSTOMER the Applicant). */
export const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'Applicant',
  UNDERWRITER: 'Underwriter',
  ADMIN: 'Admin',
  POLICY_EDITOR: 'Policy editor',
};

const ROUTE_ROLES: Record<string, readonly Role[] | 'ALL'> = {
  [HOME_PATH]: 'ALL',
  [POLICIES_PATH]: POLICY_ROLES,
  [APPLICATION_ROUTE]: REVIEW_ROLES,
};

/** Where a role lands after sign-in. The policy editor's landing screen is
 * built; the other roles' landing screens arrive with their stories, so they
 * land on the role-aware home until then. */
export function landingPath(role: Role): string {
  return role === 'POLICY_EDITOR' ? POLICIES_PATH : HOME_PATH;
}

export function canOpen(role: Role, path: string): boolean {
  const allowed = ROUTE_ROLES[APPLICATION_PATH.test(path) ? APPLICATION_ROUTE : path];
  if (allowed === undefined) return false;
  return allowed === 'ALL' || allowed.includes(role);
}

export function navFor(role: Role): NavItem[] {
  const items: NavItem[] = [{ label: 'Home', to: HOME_PATH }];
  if (canOpen(role, POLICIES_PATH)) items.push({ label: 'Policies', to: POLICIES_PATH });
  return items;
}
