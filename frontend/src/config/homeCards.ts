/** Role-aware home cards (ui_spec §2, §3). A card links only to a screen that
 * is built and that the role may open; a card for a screen that ships with a
 * later story has `to: null` and is shown as "Coming soon", never as a dead
 * link. */

import type { Role } from '../types/auth';
import { canOpen } from './roleRoutes';

export type HomeCardId = 'applications' | 'queue' | 'policies' | 'audit';

export interface HomeCard {
  id: HomeCardId;
  title: string;
  description: string;
  /** Route to open, or `null` when the screen is not built yet. */
  to: string | null;
}

const BUILT_ROUTE: Partial<Record<HomeCardId, string>> = {
  policies: '/policies',
  applications: '/applications',
};

const CARDS: Record<HomeCardId, Omit<HomeCard, 'to'>> = {
  applications: {
    id: 'applications',
    title: 'Applications',
    description: 'Track loan applications, their status and decisions.',
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
  CUSTOMER: ['applications'],
  UNDERWRITER: ['queue', 'applications'],
  POLICY_EDITOR: ['policies'],
  ADMIN: ['applications', 'policies', 'audit'],
};

export function cardsFor(role: Role): HomeCard[] {
  return CARDS_BY_ROLE[role].map((id) => {
    const route = BUILT_ROUTE[id];
    return { ...CARDS[id], to: route && canOpen(role, route) ? route : null };
  });
}
