/** Loads one resource and exposes loading, error, retry and a local setter.
 * `load` must be referentially stable (wrap it in `useCallback`). */

import { useCallback, useEffect, useState } from 'react';

import { toReviewError, type ReviewError } from './useReview';

export interface UseLoadResult<T> {
  data: T | null;
  loading: boolean;
  error: ReviewError | null;
  reload: () => void;
  setData: (update: (current: T) => T) => void;
}

interface State<T> {
  data: T | null;
  loading: boolean;
  error: ReviewError | null;
}

export function useLoad<T>(load: () => Promise<T>): UseLoadResult<T> {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    load()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (active) setState({ data: null, loading: false, error: toReviewError(err) });
      });
    return () => {
      active = false;
    };
  }, [load, attempt]);

  const reload = useCallback((): void => setAttempt((n) => n + 1), []);
  const setData = useCallback((update: (current: T) => T): void => {
    setState((prev) => (prev.data === null ? prev : { ...prev, data: update(prev.data) }));
  }, []);
  return { ...state, reload, setData };
}
