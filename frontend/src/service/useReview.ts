/** Loads one application with its decision and runs the manual-review and
 * override actions (E3-S5). The domain decides: after an action the screen
 * shows what the API returned, never a locally guessed status. */

import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../repository/apiClient';
import * as reviewRepo from '../repository/reviewRepo';
import type { ApplicationDetail, DecisionDetail, ReviewOutcome } from '../types/review';

export interface ReviewError {
  message: string;
  code: string;
  correlationId: string | null;
}

export interface UseReviewResult {
  application: ApplicationDetail | null;
  decision: DecisionDetail | null;
  loading: boolean;
  loadError: ReviewError | null;
  submitting: boolean;
  actionError: ReviewError | null;
  reload: () => void;
  review: (outcome: ReviewOutcome, reason: string) => Promise<boolean>;
  override: (reasonCode: string, comment: string) => Promise<boolean>;
}

export function toReviewError(err: unknown): ReviewError {
  if (err instanceof ApiError) {
    return { message: err.message, code: err.code, correlationId: err.correlationId ?? null };
  }
  return { message: 'Something went wrong. Try again.', code: 'UNKNOWN', correlationId: null };
}

interface Loaded {
  application: ApplicationDetail | null;
  decision: DecisionDetail | null;
  loading: boolean;
  loadError: ReviewError | null;
}

function useLoader(id: number): [Loaded, (decision: DecisionDetail) => void, () => void] {
  const [state, setState] = useState<Loaded>({ application: null, decision: null, loading: true, loadError: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, loadError: null }));
    Promise.all([reviewRepo.getApplication(id), reviewRepo.getDecision(id)])
      .then(([application, decision]) => {
        if (active) setState({ application, decision, loading: false, loadError: null });
      })
      .catch((err: unknown) => {
        if (active) setState({ application: null, decision: null, loading: false, loadError: toReviewError(err) });
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  const applyDecision = useCallback((decision: DecisionDetail): void => {
    setState((prev) => ({
      ...prev,
      decision,
      application: prev.application && { ...prev.application, status: decision.status },
    }));
  }, []);
  const reload = useCallback((): void => setAttempt((n) => n + 1), []);
  return [state, applyDecision, reload];
}

interface Runner {
  submitting: boolean;
  actionError: ReviewError | null;
  run: (action: () => Promise<DecisionDetail>) => Promise<boolean>;
}

function useRunner(applyDecision: (decision: DecisionDetail) => void): Runner {
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<ReviewError | null>(null);

  const run = useCallback(
    async (action: () => Promise<DecisionDetail>): Promise<boolean> => {
      setSubmitting(true);
      setActionError(null);
      try {
        applyDecision(await action());
        return true;
      } catch (err) {
        setActionError(toReviewError(err));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [applyDecision],
  );
  return { submitting, actionError, run };
}

export function useReview(id: number): UseReviewResult {
  const [loaded, applyDecision, reload] = useLoader(id);
  const { submitting, actionError, run } = useRunner(applyDecision);
  const review = useCallback(
    (outcome: ReviewOutcome, reason: string) => run(() => reviewRepo.submitReview(id, outcome, reason)),
    [id, run],
  );
  const override = useCallback(
    (reasonCode: string, comment: string) => run(() => reviewRepo.submitOverride(id, reasonCode, comment)),
    [id, run],
  );
  return { ...loaded, submitting, actionError, reload, review, override };
}
