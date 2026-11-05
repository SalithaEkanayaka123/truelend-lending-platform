import { describe, expect, it } from 'vitest';

import { displayNameFromEmail } from './displayName';

describe('displayNameFromEmail', () => {
  it('title-cases the local part', () => {
    expect(displayNameFromEmail('admin@example.test')).toBe('Admin');
    expect(displayNameFromEmail('policy@example.test')).toBe('Policy');
  });

  it('splits separators and trailing digits into words', () => {
    expect(displayNameFromEmail('customer1@example.test')).toBe('Customer 1');
    expect(displayNameFromEmail('jane.doe@example.test')).toBe('Jane Doe');
    expect(displayNameFromEmail('a_b-c@example.test')).toBe('A B C');
  });

  it('falls back to a neutral label for an empty or missing value', () => {
    expect(displayNameFromEmail('')).toBe('Signed in');
    expect(displayNameFromEmail(null)).toBe('Signed in');
    expect(displayNameFromEmail('@example.test')).toBe('Signed in');
  });
});
