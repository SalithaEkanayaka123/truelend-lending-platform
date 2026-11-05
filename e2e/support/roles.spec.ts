import { expect, test } from '@playwright/test';

import { ROLES } from './roles';

// Pins the e2e role table to the F0 permission matrix, so a typo here cannot
// silently weaken the API and UI specs that read it.
test('the role table covers exactly the four roles', () => {
  expect(ROLES.map((r) => r.role)).toEqual(['ADMIN', 'POLICY_EDITOR', 'UNDERWRITER', 'CUSTOMER']);
});

test('audit read is ADMIN only', () => {
  expect(ROLES.filter((r) => r.audit === 200).map((r) => r.role)).toEqual(['ADMIN']);
});

test('policy list is POLICY_EDITOR and ADMIN only', () => {
  expect(ROLES.filter((r) => r.policies === 200).map((r) => r.role)).toEqual(['ADMIN', 'POLICY_EDITOR']);
});

test('the product catalog is open to every role', () => {
  expect(ROLES.every((r) => r.products === 200)).toBe(true);
});

test('every non-200 expectation is a 403', () => {
  const all = ROLES.flatMap((r) => [r.products, r.policies, r.audit]);
  expect(all.every((s) => s === 200 || s === 403)).toBe(true);
});
