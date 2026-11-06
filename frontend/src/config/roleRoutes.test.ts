import { describe, expect, it } from 'vitest';

import type { Role } from '../types/auth';
import { canOpen, landingPath, navFor } from './roleRoutes';

const ROLES: Role[] = ['CUSTOMER', 'UNDERWRITER', 'POLICY_EDITOR', 'ADMIN'];

describe('roleRoutes', () => {
  it('lands the policy editor on the policy screen and everyone else on their home', () => {
    expect(landingPath('POLICY_EDITOR')).toBe('/policies');
    expect(landingPath('ADMIN')).toBe('/home');
    expect(landingPath('UNDERWRITER')).toBe('/home');
    expect(landingPath('CUSTOMER')).toBe('/home');
  });

  it('lets only POLICY_EDITOR and ADMIN open /policies', () => {
    const allowed = ROLES.filter((role) => canOpen(role, '/policies'));
    expect(allowed).toEqual(['POLICY_EDITOR', 'ADMIN']);
  });

  it('lets only UNDERWRITER and ADMIN open an application review', () => {
    const allowed = ROLES.filter((role) => canOpen(role, '/applications/6'));
    expect(allowed).toEqual(['UNDERWRITER', 'ADMIN']);
  });

  it('lets every role open /home', () => {
    expect(ROLES.every((role) => canOpen(role, '/home'))).toBe(true);
  });

  it('never lists a link the role cannot open', () => {
    for (const role of ROLES) {
      expect(navFor(role).every((item) => canOpen(role, item.to))).toBe(true);
    }
  });

  it('shows Policies in the nav only for roles that can open it', () => {
    expect(navFor('CUSTOMER').map((i) => i.label)).toEqual(['Home']);
    expect(navFor('ADMIN').map((i) => i.label)).toEqual(['Home', 'Policies']);
  });
});
