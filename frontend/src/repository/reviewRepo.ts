/** Typed client for the application, decision, review and override endpoints
 * (E3-S5). Nothing outside `repository/` calls `apiClient` for these. */

import type { ApplicationDetail, DecisionDetail, ReviewOutcome } from '../types/review';
import { ApiError, apiRequest } from './apiClient';

export function getApplication(id: number): Promise<ApplicationDetail> {
  return apiRequest<ApplicationDetail>(`/api/applications/${id}`);
}

/** The stored decision, or `null` while the application is not underwritten yet. */
export async function getDecision(id: number): Promise<DecisionDetail | null> {
  try {
    return await apiRequest<DecisionDetail>(`/api/applications/${id}/decision`);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'NOT_DECIDED') return null;
    throw err;
  }
}

export function submitReview(id: number, outcome: ReviewOutcome, reason: string): Promise<DecisionDetail> {
  return apiRequest<DecisionDetail>(`/api/applications/${id}/review`, { method: 'POST', body: { outcome, reason } });
}

export function submitOverride(id: number, reasonCode: string, comment: string): Promise<DecisionDetail> {
  return apiRequest<DecisionDetail>(`/api/applications/${id}/override`, {
    method: 'POST',
    body: { reason_code: reasonCode, comment },
  });
}
