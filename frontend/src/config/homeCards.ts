/** Role-aware home cards (ui_spec §2, §3). A card links only to a screen that
 * is built and that the role may open; a card for a screen that has not been
 * built (Work queue, Audit) has `to: null` and is shown as "Coming soon",
 * never as a dead link. A card for a built screen is always a real link. */

import type { Role } from '../types/auth';
import { canOpen } from './roleRoutes';

export type HomeCardId = 'apply' | 'applications' | 'verification' | 'queue' | 'policies' | 'audit';

export interface HomeCard {
  id: HomeCardId;
  title: string;
  description: string;
  /** Route to open, or `null` when the screen is not built yet. */
  to: string | null;
}

const BUILT_ROUTE: Partial<Record<HomeCardId, string>> = {
  apply: '/apply',
  applications: '/applications',
  verification: '/verification',
  policies: '/policies',
};

const CARDS: Record<HomeCardId, Omit<HomeCard, 'to'>> = {
  apply: {
    id: 'apply',
    title: 'Apply for a loan',
    description: 'Start a new application and upload your documents.',
  },
  applications: {
    id: 'applications',
    title: 'My applications',
    description: 'Track your applications, their status and decisions.',
  },
  verification: {
    id: 'verification',
    title: 'Verification queue',
    description: 'Verify the documents applicants have uploaded.',
  },
  queue: {
    id: 'queue',
    title: 'Work queue',
    description: 'Applications waiting for manual review.',
  },
  policies: {
    id: 'policies',
    title: 'Policies',
    description: 'Review and edit underwriting thresholds by product.',
  },
  audit: {
    id: 'audit',
    title: 'Audit',
    description: 'Read the append-only record of who did what.',
  },
};

const CARDS_BY_ROLE: Record<Role, readonly HomeCardId[]> = {
  CUSTOMER: ['apply', 'applications'],
  UNDERWRITER: ['verification', 'queue'],
  POLICY_EDITOR: ['policies'],
  ADMIN: ['policies', 'audit'],
};

/** One line under the welcome title: what this role does here. */
export const HOME_LEAD: Record<Role, string> = {
  CUSTOMER: 'Apply for a loan, upload your documents and follow each application through to a decision.',
  UNDERWRITER: 'Verify applicants’ documents and review the applications that need a manual decision.',
  ADMIN: 'Oversee underwriting policy versions and approve the changes your policy editors propose.',
  POLICY_EDITOR: 'Edit underwriting thresholds by product and propose new policy versions for approval.',
};

export function cardsFor(role: Role): HomeCard[] {
  return CARDS_BY_ROLE[role].map((id) => {
    const route = BUILT_ROUTE[id];
    return { ...CARDS[id], to: route && canOpen(role, route) ? route : null };
  });
}
