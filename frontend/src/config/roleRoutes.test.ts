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

  it('lets CUSTOMER, UNDERWRITER and ADMIN open an application', () => {
    const allowed = ROLES.filter((role) => canOpen(role, '/applications/6'));
    expect(allowed).toEqual(['CUSTOMER', 'UNDERWRITER', 'ADMIN']);
  });

  it('lets only CUSTOMER open /apply and /applications', () => {
    expect(ROLES.filter((role) => canOpen(role, '/apply'))).toEqual(['CUSTOMER']);
    expect(ROLES.filter((role) => canOpen(role, '/applications'))).toEqual(['CUSTOMER']);
  });

  it('lets only UNDERWRITER open /verification', () => {
    expect(ROLES.filter((role) => canOpen(role, '/verification'))).toEqual(['UNDERWRITER']);
  });

  it('lets every role open /home', () => {
    expect(ROLES.every((role) => canOpen(role, '/home'))).toBe(true);
  });

  it('never lists a link the role cannot open', () => {
    for (const role of ROLES) {
      expect(navFor(role).every((item) => canOpen(role, item.to))).toBe(true);
    }
  });

  it('shows each role only the nav links it can open', () => {
    const labels = (role: Role): string[] => navFor(role).map((i) => i.label);
    expect(labels('CUSTOMER')).toEqual(['Home', 'My applications', 'Apply']);
    expect(labels('UNDERWRITER')).toEqual(['Home', 'Verification']);
    expect(labels('ADMIN')).toEqual(['Home', 'Policies']);
    expect(labels('POLICY_EDITOR')).toEqual(['Home', 'Policies']);
  });
});
