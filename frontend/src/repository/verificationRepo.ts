/** Typed client for the verification queue (E2-S4, ui_spec S-U-2). */

import type { QueuePage, VerifyOutcome } from '../types/apply';
import { apiRequest } from './apiClient';

const PAGE_SIZE = 50;

export function getQueue(): Promise<QueuePage> {
  return apiRequest<QueuePage>(`/api/verification-queue?limit=${PAGE_SIZE}&offset=0`);
}

export function verifyDocument(documentId: number, outcome: VerifyOutcome, reason: string): Promise<unknown> {
  return apiRequest<unknown>(`/api/documents/${documentId}/verify`, { method: 'POST', body: { outcome, reason } });
}
