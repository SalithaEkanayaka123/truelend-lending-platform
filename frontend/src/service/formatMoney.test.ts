import { describe, expect, it } from 'vitest';

import { formatRupees, groupThousands } from './formatMoney';

describe('groupThousands', () => {
  it('groups the integer digits in threes and keeps the fraction', () => {
    expect(groupThousands('1500000.00')).toBe('1,500,000.00');
    expect(groupThousands('50000.00')).toBe('50,000.00');
    expect(groupThousands('999')).toBe('999');
    expect(groupThousands('1000')).toBe('1,000');
  });

  it('keeps a sign and a trailing decimal point while typing', () => {
    expect(groupThousands('-12345.5')).toBe('-12,345.5');
    expect(groupThousands('12345.')).toBe('12,345.');
  });

  it('returns anything that is not a plain decimal string untouched', () => {
    expect(groupThousands('')).toBe('');
    expect(groupThousands('abc')).toBe('abc');
    expect(groupThousands('1e6')).toBe('1e6');
  });

  it('is exact for values beyond float precision (no Number arithmetic)', () => {
    expect(groupThousands('12345678901234567890.12')).toBe('12,345,678,901,234,567,890.12');
  });
});

describe('formatRupees', () => {
  it('prefixes the rupee sign to the grouped value', () => {
    expect(formatRupees('1500000.00')).toBe('₹1,500,000.00');
  });

  it('shows nothing for an empty value', () => {
    expect(formatRupees('')).toBe('');
  });
});
