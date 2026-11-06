/** Verification queue (E2-S4-AC3): loads the queue and, after the API accepts
 * a verify or reject, removes that item locally so the list updates without
 * a reload. */

import { useCallback, useState } from 'react';

import * as verificationRepo from '../repository/verificationRepo';
import type { QueueItem, QueuePage, VerifyOutcome } from '../types/apply';
import { useLoad, type UseLoadResult } from './useLoad';
import { toReviewError, type ReviewError } from './useReview';

export interface UseVerificationQueue {
  queue: UseLoadResult<QueuePage>;
  submitting: boolean;
  actionError: ReviewError | null;
  clearError: () => void;
  decide: (item: QueueItem, outcome: VerifyOutcome, reason: string) => Promise<boolean>;
}

const loadQueue = (): Promise<QueuePage> => verificationRepo.getQueue();

export function withoutItem(page: QueuePage, documentId: number): QueuePage {
  return {
    ...page,
    items: page.items.filter((i) => i.document_id !== documentId),
    total: Math.max(0, page.total - 1),
  };
}

export function useVerificationQueue(): UseVerificationQueue {
  const queue = useLoad(loadQueue);
  const { setData } = queue;
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<ReviewError | null>(null);

  const decide = useCallback(
    async (item: QueueItem, outcome: VerifyOutcome, reason: string): Promise<boolean> => {
      setSubmitting(true);
      setActionError(null);
      try {
        await verificationRepo.verifyDocument(item.document_id, outcome, reason);
        setData((page) => withoutItem(page, item.document_id));
        return true;
      } catch (err) {
        setActionError(toReviewError(err));
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [setData],
  );
  const clearError = useCallback((): void => setActionError(null), []);
  return { queue, submitting, actionError, clearError, decide };
}
