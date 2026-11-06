import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { useDocumentTitle } from './useDocumentTitle';

function wrapperAt(path: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };
}

describe('useDocumentTitle', () => {
  it('sets document.title from the current route', () => {
    renderHook(() => useDocumentTitle(), { wrapper: wrapperAt('/policies') });
    expect(document.title).toBe('Policy editor · TrueLend');
  });

  it('uses the product name on an unknown route', () => {
    renderHook(() => useDocumentTitle(), { wrapper: wrapperAt('/zzz') });
    expect(document.title).toBe('TrueLend');
  });
});
