/** Server side of the apply wizard (E2-S4): create the DRAFT, stub-upload
 * documents, then submit and underwrite. The domain decides; this hook only
 * relays and keeps the last application the API returned. */

import { useCallback, useState } from 'react';

import { ApiError } from '../repository/apiClient';
import * as applyRepo from '../repository/applyRepo';
import { rememberApplicationId } from '../repository/applicationIdsStore';
import type { CreateApplicationRequest } from '../types/apply';
import type { DocumentType } from '../types/policy';
import type { ApplicationDetail } from '../types/review';
import { toReviewError, type ReviewError } from './useReview';

export interface UseDraftFlow {
  application: ApplicationDetail | null;
  busy: boolean;
  error: ReviewError | null;
  highlightMissing: boolean;
  create: (request: CreateApplicationRequest) => Promise<boolean>;
  upload: (type: DocumentType) => Promise<void>;
  submit: () => Promise<number | null>;
}

type Run = <T>(action: () => Promise<T>) => Promise<T | null>;

interface Runner {
  busy: boolean;
  error: ReviewError | null;
  highlightMissing: boolean;
  run: Run;
}

function useRunner(): Runner {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReviewError | null>(null);
  const [highlightMissing, setHighlightMissing] = useState(false);

  const run = useCallback<Run>(async (action) => {
    setBusy(true);
    setError(null);
    setHighlightMissing(false);
    try {
      return await action();
    } catch (err) {
      setError(toReviewError(err));
      setHighlightMissing(err instanceof ApiError && err.code === 'MISSING_DOCUMENTS');
      return null;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, highlightMissing, run };
}

async function submitAndUnderwrite(id: number): Promise<number> {
  await applyRepo.submitApplication(id);
  await applyRepo.underwriteApplication(id);
  return id;
}

export function useDraftFlow(): UseDraftFlow {
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const { run, ...status } = useRunner();

  const create = useCallback(
    async (request: CreateApplicationRequest): Promise<boolean> => {
      const created = await run(() => applyRepo.createApplication(request));
      if (!created) return false;
      rememberApplicationId(created.id);
      setApplication(created);
      return true;
    },
    [run],
  );
  const upload = useCallback(
    async (type: DocumentType): Promise<void> => {
      if (!application) return;
      const updated = await run(() => applyRepo.uploadDocument(application.id, type, `${type.toLowerCase()}.pdf`));
      if (updated) setApplication(updated);
    },
    [application, run],
  );
  const submit = useCallback(
    async (): Promise<number | null> => (application ? run(() => submitAndUnderwrite(application.id)) : null),
    [application, run],
  );

  return { application, ...status, create, upload, submit };
}
