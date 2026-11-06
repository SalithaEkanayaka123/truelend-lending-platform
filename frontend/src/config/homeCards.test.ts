import { describe, expect, it } from 'vitest';

import type { Role } from '../types/auth';
import { cardsFor, HOME_LEAD } from './homeCards';
import { canOpen } from './roleRoutes';

const ids = (role: Role): string[] => cardsFor(role).map((c) => c.id);
const card = (role: Role, id: string) => cardsFor(role).find((c) => c.id === id);

describe('cardsFor', () => {
  it('gives each role its own cards', () => {
    expect(ids('CUSTOMER')).toEqual(['apply', 'applications']);
    expect(ids('UNDERWRITER')).toEqual(['verification', 'queue']);
    expect(ids('POLICY_EDITOR')).toEqual(['policies']);
    expect(ids('ADMIN')).toEqual(['policies', 'audit']);
  });

  it('gives the applicant real cards for Apply and My applications', () => {
    expect(card('CUSTOMER', 'apply')).toMatchObject({ title: 'Apply for a loan', to: '/apply' });
    expect(card('CUSTOMER', 'applications')).toMatchObject({ title: 'My applications', to: '/applications' });
  });

  it('links the underwriter to the verification queue', () => {
    expect(card('UNDERWRITER', 'verification')).toMatchObject({ title: 'Verification queue', to: '/verification' });
  });

  it('links Policies for ADMIN and POLICY_EDITOR', () => {
    expect(card('ADMIN', 'policies')?.to).toBe('/policies');
    expect(card('POLICY_EDITOR', 'policies')?.to).toBe('/policies');
  });

  it('only marks Work queue and Audit as not linked, because those screens do not exist', () => {
    for (const role of ['CUSTOMER', 'UNDERWRITER', 'ADMIN', 'POLICY_EDITOR'] as const) {
      for (const c of cardsFor(role)) {
        if (c.to === null) expect(['queue', 'audit']).toContain(c.id);
      }
    }
  });

  it('links only to routes the role can open', () => {
    for (const role of ['CUSTOMER', 'UNDERWRITER', 'ADMIN', 'POLICY_EDITOR'] as const) {
      for (const c of cardsFor(role)) {
        if (c.to !== null) expect(canOpen(role, c.to)).toBe(true);
      }
    }
  });

  it('never offers Audit or Work queue to roles that cannot use them', () => {
    expect(ids('CUSTOMER')).not.toContain('audit');
    expect(ids('POLICY_EDITOR')).not.toContain('queue');
    expect(ids('ADMIN')).not.toContain('queue');
  });
});

describe('HOME_LEAD', () => {
  it('has one line per role and never the old placeholder', () => {
    for (const role of ['CUSTOMER', 'UNDERWRITER', 'ADMIN', 'POLICY_EDITOR'] as const) {
      expect(HOME_LEAD[role].length).toBeGreaterThan(20);
      expect(HOME_LEAD[role]).not.toMatch(/pick up where/i);
    }
  });
});
