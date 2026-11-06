import { describe, expect, it } from 'vitest';

import { titleFor } from './routeTitles';

describe('titleFor', () => {
  it.each([
    ['/sign-in', 'Sign in · TrueLend'],
    ['/home', 'Home · TrueLend'],
    ['/policies', 'Policy editor · TrueLend'],
    ['/apply', 'Apply · TrueLend'],
    ['/applications', 'My applications · TrueLend'],
    ['/applications/12', 'Application · TrueLend'],
    ['/verification', 'Verification queue · TrueLend'],
  ])('titles %s as %s', (path, title) => {
    expect(titleFor(path)).toBe(title);
  });

  it('falls back to the product name for an unknown route', () => {
    expect(titleFor('/nope')).toBe('TrueLend');
    expect(titleFor('/')).toBe('TrueLend');
  });
});
