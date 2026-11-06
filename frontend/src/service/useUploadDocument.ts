/** Stub document upload from the applicant tracker (S-A-5): sends the type and
 * a file name only, then lets the caller refresh what the API now stores. */

import { useCallback, useState } from 'react';

import * as applyRepo from '../repository/applyRepo';
import type { DocumentType } from '../types/policy';
import { toReviewError, type ReviewError } from './useReview';

export interface UseUploadDocument {
  uploading: boolean;
  error: ReviewError | null;
  upload: (type: DocumentType) => Promise<void>;
}

export function useUploadDocument(applicationId: number, onDone: () => void): UseUploadDocument {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<ReviewError | null>(null);

  const upload = useCallback(
    async (type: DocumentType): Promise<void> => {
      setUploading(true);
      setError(null);
      try {
        await applyRepo.uploadDocument(applicationId, type, `${type.toLowerCase()}.pdf`);
        onDone();
      } catch (err) {
        setError(toReviewError(err));
      } finally {
        setUploading(false);
      }
    },
    [applicationId, onDone],
  );
  return { uploading, error, upload };
}
