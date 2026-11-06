/** Load failure for a single application (ui_spec section 7): "Not found" and
 * "No access" are full-page states; anything else is a retryable error card
 * with the correlation id. */

import type { JSX } from 'react';

import type { ReviewError } from '../../service/useReview';
import { ErrorState } from './ErrorState';
import { FullPageState } from './FullPageState';

export interface ApplicationLoadErrorProps {
  error: ReviewError;
  onRetry: () => void;
}

export function ApplicationLoadError({ error, onRetry }: ApplicationLoadErrorProps): JSX.Element {
  if (error.code === 'NOT_FOUND') {
    return <FullPageState title="Not found" message="We could not find that application." />;
  }
  if (error.code === 'FORBIDDEN') {
    return <FullPageState title="No access" message="Your role cannot open this application." />;
  }
  return <ErrorState message={error.message} correlationId={error.correlationId} onRetry={onRetry} />;
}
