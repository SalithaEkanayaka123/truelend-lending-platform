import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDismissable } from './useDismissable';

describe('useDismissable', () => {
  it('shows the message until it is dismissed', () => {
    const { result } = renderHook(({ message }) => useDismissable(message), { initialProps: { message: 'Draft v2' as string | null } });
    expect(result.current[0]).toBe('Draft v2');

    act(() => result.current[1]());
    expect(result.current[0]).toBeNull();
  });

  it('shows a new, different message after one was dismissed', () => {
    const { result, rerender } = renderHook(({ message }) => useDismissable(message), {
      initialProps: { message: 'Draft v2' as string | null },
    });
    act(() => result.current[1]());
    rerender({ message: 'Draft v3' });
    expect(result.current[0]).toBe('Draft v3');
  });

  it('shows the same message again once it has been cleared in between', () => {
    const { result, rerender } = renderHook(({ message }) => useDismissable(message), {
      initialProps: { message: 'Could not save.' as string | null },
    });
    act(() => result.current[1]());
    expect(result.current[0]).toBeNull();

    rerender({ message: null });
    rerender({ message: 'Could not save.' });
    expect(result.current[0]).toBe('Could not save.');
  });

  it('shows nothing for a null message', () => {
    const { result } = renderHook(() => useDismissable(null));
    expect(result.current[0]).toBeNull();
  });
});
