/** Wire shapes for the apply wizard and the verification queue (E2-S4,
 * ui_spec S-A-2..S-A-4 and S-U-2). Money stays a string end to end (NFR-01). */

import type { DocumentType, ProductType } from './policy';
import type { ApplicationStatus, DecisionType } from './review';

export interface CreditFlags {
  prior_default: boolean;
  missed_payment_12m: boolean;
  thin_file: boolean;
}

export interface CreateApplicationRequest {
  product_type: ProductType;
  requested_amount: string;
  tenure_months: number;
  age_years: number;
  monthly_income: string;
  credit_flags: CreditFlags;
  pan: string;
  aadhaar: string;
}

export interface UnderwriteResult {
  decision: DecisionType;
  score: number;
  reason_codes: string[];
  policy_version: number;
  status: ApplicationStatus;
}

export type VerifyOutcome = 'VERIFIED' | 'REJECTED';

export interface QueueItem {
  document_id: number;
  application_id: number;
  type: DocumentType;
  uploaded_at: string;
}

export interface QueuePage {
  items: QueueItem[];
  total: number;
  limit: number;
  offset: number;
}
