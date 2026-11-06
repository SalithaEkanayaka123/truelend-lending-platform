/** Wire shapes for the application review screen (E3-S5, ui_spec S-U-4). */

export type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'MANUAL_REVIEW' | 'APPROVED' | 'REJECTED';
export type DocumentStatus = 'MISSING' | 'UPLOADED' | 'VERIFIED' | 'REJECTED';
export type DecisionType = 'AUTO_APPROVE' | 'AUTO_REJECT' | 'MANUAL_REVIEW';
export type ReviewOutcome = 'APPROVE' | 'REJECT';

export interface ChecklistItem {
  document_id: number;
  type: string;
  status: DocumentStatus;
  filename: string | null;
  reason: string | null;
}

export interface ApplicationDetail {
  id: number;
  product_type: string;
  requested_amount: string;
  tenure_months: number;
  age_years: number;
  monthly_income: string;
  pan_masked: string;
  aadhaar_masked: string;
  status: ApplicationStatus;
  policy_version: number | null;
  required_documents: ChecklistItem[];
}

export interface ReasonCode {
  code: string;
  message: string;
}

export interface Resolution {
  kind: 'MANUAL_REVIEW' | 'OVERRIDE';
  outcome: 'APPROVED' | 'REJECTED';
  reason_code: string | null;
  comment: string;
  resolved_by: number;
  resolved_at: string;
}

export interface DecisionDetail {
  application_id: number;
  status: ApplicationStatus;
  decision: DecisionType;
  score: number;
  reason_codes: ReasonCode[];
  policy_version: number;
  decided_at: string;
  thresholds: { auto_reject_below_score: number | null; auto_approve_min_score: number | null };
  override_reason_codes: string[];
  resolution: Resolution | null;
}
