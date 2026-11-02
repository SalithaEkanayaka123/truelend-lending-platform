# F2 — Apply, Documents and Verification Queue

- **Feature / epic:** F2 / E2 · **Sprint:** 1 · **Parent:** `specs/app_spec.md`
- **Covers:** AC-02, AC-06; NFR-03 (identifiers and filenames), NFR-04 (underwriter verification audited)
- **Depends on:** F0 — `{E0-S1, contract, auth guard}`, `{E0-S2, contract, audit writer}`; F1 — `{E1-S1, data, active policy thresholds and checklists}`
- Shared conventions are in `F0-platform.md`; policy v1 values are in `F1-product-catalog.md`.

## Settled assumptions

| ID | Settles | Assumption |
|----|---------|------------|
| FA-F2.1 | App fields | An application holds: `product_type`, `requested_amount`, `tenure_months`, `age_years` (whole years, supplied, not derived), `monthly_income` (INR), `credit_flags` (`prior_default`, `missed_payment_12m`, `thin_file`, all booleans), `pan`, `aadhaar`. The rate comes from the pinned policy (F1), not from the customer. |
| FA-F2.2 | Validation | `requested_amount` and `tenure_months` must lie inside the active policy's range for the product at apply time. Income is **not** checked here; it is a rule-engine matter (F3, AC-05). PAN matches `[A-Z]{5}[0-9]{4}[A-Z]`; Aadhaar is exactly 12 digits (both synthetic). |
| FA-F2.3 | Masking | Responses return `pan_masked` (`******234F`) and `aadhaar_masked` (`********9012`); full values are stored and never returned or logged. |
| FA-F2.4 | AC-02 | Applying creates `DRAFT` plus one `documents` row per required type, status `MISSING`. |
| FA-F2.5 | Upload stub | Upload records metadata only (`type`, `filename`); file content is not sent or stored. Allowed while the application is `DRAFT` or `SUBMITTED`; re-uploading a `REJECTED` document sets it back to `UPLOADED`. |
| FA-F2.6 | Submit | Submit requires every required document to be `UPLOADED` or later. It pins the active policy version (F1) and sets `SUBMITTED`. Underwriting is a separate explicit call made by the UI straight after submit (F3), not an event. |
| FA-F2.7 | AC-06 | A reason (1–500 characters) is required for **both** `VERIFIED` and `REJECTED`. A `VERIFIED` document is final; only a `REJECTED` one can be replaced. A document's status does not gate approval; it gates disbursement (F4). |
| FA-F2.8 | Ownership | A customer sees and uploads only their own applications; others return `404`. |

## Entities

| Entity | Fields |
|---|---|
| `applications` | id, applicant_user_id, product_type, requested_amount, tenure_months, age_years, monthly_income, credit_flags (JSON), pan, aadhaar, status (`DRAFT`, `SUBMITTED`, `MANUAL_REVIEW`, `APPROVED`, `REJECTED`, `DISBURSED`), policy_version?, created_at, submitted_at? |
| `documents` | id, application_id, type, status (`MISSING`, `UPLOADED`, `VERIFIED`, `REJECTED`), filename?, reason?, uploaded_at?, verified_by?, verified_at? |

Statuses after `SUBMITTED` are set by F3 and F4.

## Endpoints

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/applications` | CUSTOMER | creates `DRAFT` |
| GET | `/api/applications/{id}` | owner, UNDERWRITER, ADMIN | status, `documents`, `missing_documents`, `decision`, `resolution`, `loan_id` (the last three are filled by F3/F4) |
| POST | `/api/applications/{id}/documents` | owner | `{type, filename}` |
| POST | `/api/applications/{id}/submit` | owner | |
| GET | `/api/verification-queue` | UNDERWRITER | `UPLOADED` documents, oldest first, paginated |
| POST | `/api/documents/{id}/verify` | UNDERWRITER | `{outcome:"VERIFIED"\|"REJECTED", reason}` |

## Stories

### E2-S1 — Apply for a loan (layer: API)
Depends on: E1-S1 (data: policy thresholds), E0-S1. Traces: AC-02, NFR-03.
- **E2-S1-AC1** — *Given* customer user 4 and policy v1, *when* they POST `/api/applications` with `PERSONAL`, amount `"200000.00"`, tenure 24, age 30, income `"60000.00"`, no flags, PAN `ABCDE1234F`, Aadhaar `123456789012`, *then* it is 201 with `id` 1, status `DRAFT`, `applicant_user_id` 4.
- **E2-S1-AC2** — *Given* that application, *when* it is returned, *then* `required_documents` is `ID_PROOF`, `ADDRESS_PROOF`, `SALARY_SLIP`, each `MISSING`; a VEHICLE application lists 4 documents including `VEHICLE_QUOTATION`; an EDUCATION one includes `ADMISSION_LETTER` and `FEE_STRUCTURE`.
- **E2-S1-AC3** — *Given* PERSONAL, *when* tenure is 72 (max 60), *then* 422 `TENURE_OUT_OF_RANGE`; *when* amount is `"10000.00"` (min `50000.00`), *then* 422 `AMOUNT_OUT_OF_RANGE`.
- **E2-S1-AC4** — *Given* PAN `abc` or an 11-digit Aadhaar, *when* posted, *then* 422 `VALIDATION_ERROR`; a valid application returns `pan_masked` `******234F` and `aadhaar_masked` `********9012` and no raw values.
- **E2-S1-AC5** — *Given* customer user 5, *when* they GET `/api/applications/1`, *then* 404.

### E2-S2 — Upload documents and submit (layer: Service)
Depends on: E2-S1 (data: application and checklist). Traces: AC-02, NFR-03.
- **E2-S2-AC1** — *Given* application 1 in `DRAFT`, *when* the owner POSTs `{type:"ID_PROOF", filename:"id_front.png"}`, *then* 201 and that document is `UPLOADED` with no file content stored.
- **E2-S2-AC2** — *Given* PERSONAL application 1, *when* they POST type `VEHICLE_QUOTATION`, *then* 422 `DOCUMENT_TYPE_NOT_REQUIRED`.
- **E2-S2-AC3** — *Given* `SALARY_SLIP` is still `MISSING`, *when* they POST submit, *then* 409 `MISSING_DOCUMENTS` with `missing` `["SALARY_SLIP"]` and status stays `DRAFT`.
- **E2-S2-AC4** — *Given* all 3 documents `UPLOADED` and the active version 1, *when* they POST submit, *then* 200, status `SUBMITTED`, `policy_version` 1 and `submitted_at` set.
- **E2-S2-AC5** — *Given* an already `SUBMITTED` application, *when* submit is posted again, *then* 409 `ALREADY_SUBMITTED`.

### E2-S3 — Verification queue (layer: Service)
Depends on: E2-S2 (data: uploaded documents), E0-S2 (contract: audit writer). Traces: AC-06, NFR-04.
- **E2-S3-AC1** — *Given* submitted application 1 with 3 `UPLOADED` documents, *when* UNDERWRITER user 3 GETs `/api/verification-queue`, *then* 3 items return oldest first, each with `document_id`, `application_id` 1 and `type`.
- **E2-S3-AC2** — *Given* document 1, *when* user 3 POSTs `{outcome:"VERIFIED", reason:"Name matches PAN record"}`, *then* 200 `VERIFIED`, `verified_by` 3, an audit row `DOCUMENT_VERIFIED`, and the item leaves the queue.
- **E2-S3-AC3** — *Given* document 2, *when* user 3 POSTs `{outcome:"REJECTED", reason:"Image unreadable"}`, *then* 200 `REJECTED` with the reason, an audit row `DOCUMENT_REJECTED`, and the application still reads `SUBMITTED`.
- **E2-S3-AC4** — *Given* a missing, empty or 501-character `reason`, *when* posted, *then* 422 `VALIDATION_ERROR` and no audit row.
- **E2-S3-AC5** — *Given* a CUSTOMER token, *when* they GET the queue or POST verify, *then* 403; *given* an already `VERIFIED` document, *when* verify is posted, *then* 409 `ALREADY_VERIFIED`.

### E2-S4 — Apply wizard and verification queue UI (layer: UI)
Depends on: E2-S2, E2-S3 (contract: endpoints). Traces: AC-02, AC-06; consumer-facing design bar.
- **E2-S4-AC1** — *Given* a customer on a 375×812 viewport, *when* they apply, *then* a three-step flow (Product, Details, Documents and submit) shows one step at a time with a progress indicator and no horizontal scroll.
- **E2-S4-AC2** — *Given* the Details step, *when* they enter tenure 72 for PERSONAL, *then* an inline error shows "12–60 months" before they continue.
- **E2-S4-AC3** — *Given* an underwriter on 1280×800, *when* they open the queue, *then* a table lists documents; at 375×812 the same data shows as stacked cards; verifying one removes it without a page reload.

## AC-tagged test list

| Test | Level | Tags |
|---|---|---|
| `api/test_apply.py::test_AC02_customer_can_apply` | API | AC-02 · E2-S1-AC1 |
| `api/test_apply.py::test_AC02_checklist_generated_per_product` | API | AC-02 · E2-S1-AC2 |
| `unit/test_intake_rules.py::test_AC02_tenure_and_amount_ranges` | Unit | AC-02 · E2-S1-AC3 |
| `api/test_apply.py::test_NFR03_identifiers_masked_in_response` | API | AC-02, NFR-03 · E2-S1-AC4 |
| `api/test_apply.py::test_AC02_other_customer_gets_404` | API | AC-02 · E2-S1-AC5 |
| `api/test_documents.py::test_AC02_upload_marks_uploaded_no_content` | API | AC-02 · E2-S2-AC1 |
| `api/test_documents.py::test_AC02_type_not_in_checklist_rejected` | API | AC-02 · E2-S2-AC2 |
| `api/test_submit.py::test_AC02_submit_blocked_with_missing_documents` | API | AC-02 · E2-S2-AC3 |
| `api/test_submit.py::test_AC02_submit_pins_active_policy_version` | API | AC-02 · E2-S2-AC4 |
| `api/test_submit.py::test_AC02_double_submit_conflict` | API | AC-02 · E2-S2-AC5 |
| `api/test_verification.py::test_AC06_queue_lists_uploaded_oldest_first` | API | AC-06 · E2-S3-AC1 |
| `api/test_verification.py::test_AC06_mark_verified_with_reason_audited` | API | AC-06, NFR-04 · E2-S3-AC2 |
| `api/test_verification.py::test_AC06_mark_rejected_with_reason_audited` | API | AC-06, NFR-04 · E2-S3-AC3 |
| `unit/test_verification_rules.py::test_AC06_reason_required_1_to_500` | Unit | AC-06 · E2-S3-AC4 |
| `api/test_verification.py::test_AC06_customer_forbidden_and_verified_is_final` | API | AC-06 · E2-S3-AC5 |
| `e2e/apply.spec.ts::AC02 wizard steps at 375px` | Playwright | AC-02 · E2-S4-AC1 |
| `ui/DetailsStep.test.tsx::AC02 tenure error shown inline` | Vitest | AC-02 · E2-S4-AC2 |
| `e2e/verification-queue.spec.ts::AC06 table desktop, cards mobile` | Playwright | AC-06 · E2-S4-AC3 |

## Out of scope for F2

Real file storage, OCR or virus scanning; co-applicants; editing an application after submission; withdrawing an application.
