import { describe, expect, it } from 'vitest';

import { cardsFor } from './homeCards';

const ids = (role: Parameters<typeof cardsFor>[0]): string[] => cardsFor(role).map((c) => c.id);

describe('cardsFor', () => {
  it('gives each role its own cards', () => {
    expect(ids('CUSTOMER')).toEqual(['applications']);
    expect(ids('UNDERWRITER')).toEqual(['queue', 'applications']);
    expect(ids('POLICY_EDITOR')).toEqual(['policies']);
    expect(ids('ADMIN')).toEqual(['applications', 'policies', 'audit']);
  });

  it('links only to screens that are built and that the role can open', () => {
    expect(cardsFor('ADMIN').find((c) => c.id === 'policies')?.to).toBe('/policies');
    expect(cardsFor('POLICY_EDITOR').find((c) => c.id === 'policies')?.to).toBe('/policies');
    expect(cardsFor('CUSTOMER').find((c) => c.id === 'applications')?.to).toBe('/applications');
  });

  it('marks cards for screens that do not exist yet as not linked', () => {
    for (const role of ['UNDERWRITER', 'ADMIN'] as const) {
      const unbuilt = cardsFor(role).filter((c) => c.id !== 'policies');
      expect(unbuilt.every((c) => c.to === null)).toBe(true);
    }
  });

  it('never offers Audit or Work queue to roles that cannot use them', () => {
    expect(ids('CUSTOMER')).not.toContain('audit');
    expect(ids('POLICY_EDITOR')).not.toContain('queue');
    expect(ids('ADMIN')).not.toContain('queue');
  });
});
