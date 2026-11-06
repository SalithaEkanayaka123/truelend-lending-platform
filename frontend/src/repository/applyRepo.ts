/** Typed client for the apply, upload, submit and underwrite endpoints
 * (E2-S4). Nothing outside `repository/` calls `apiClient` for these. */

import type { CreateApplicationRequest, UnderwriteResult } from '../types/apply';
import type { DocumentType } from '../types/policy';
import type { ApplicationDetail } from '../types/review';
import { apiRequest } from './apiClient';

export function createApplication(request: CreateApplicationRequest): Promise<ApplicationDetail> {
  return apiRequest<ApplicationDetail>('/api/applications', { method: 'POST', body: request });
}

/** Stub upload (ui_spec S-A-4): sends the document type and a file name only. */
export function uploadDocument(id: number, type: DocumentType, filename: string): Promise<ApplicationDetail> {
  return apiRequest<ApplicationDetail>(`/api/applications/${id}/documents`, {
    method: 'POST',
    body: { type, filename },
  });
}

export function submitApplication(id: number): Promise<ApplicationDetail> {
  return apiRequest<ApplicationDetail>(`/api/applications/${id}/submit`, { method: 'POST' });
}

export function underwriteApplication(id: number): Promise<UnderwriteResult> {
  return apiRequest<UnderwriteResult>(`/api/applications/${id}/underwrite`, { method: 'POST' });
}
