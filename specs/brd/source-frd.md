# TrueLend — Product Requirements (BC-AINE-003)

Sources: `docs/brief/AI Native Engineer Capstone - BC-003 TrueLend.pdf` (the only requirements source), `specs/app_spec.md`, `specs/features/F0..F5`. Each FR keeps the id of the brief criterion (AC-nn) or derived scenario (D-nn) it comes from; the detail, entities and endpoints are in the feature specs.

## Problem and goal

Horizon Bank wants a configurable loan-origination platform so the business can launch loan products without code changes. Goal: one working system that takes a loan from application through underwriting, disbursement and repayment, with product rules held in versioned policy files, built entirely by supervised Claude Code agents.

## Users

Customer, Underwriter, Policy editor, Admin, and the System scheduler (end-of-day job). The role model is inferred from the brief; see Assumptions.

## Functional Requirements

- **FR-1** (AC-01) The loan product catalog offers at least 3 products — Personal, Vehicle and Education — each with its own rule set read from a versioned policy file.
- **FR-2** (AC-02) A customer can apply for a loan for a chosen product, and a required-document checklist specific to that product is generated.
- **FR-3** (AC-03) A credit-scoring stub returns a deterministic score from age, income and credit-history flags.
- **FR-4** (AC-04) Underwriting returns AUTO_APPROVE, AUTO_REJECT or MANUAL_REVIEW with reason codes referenced from the active policy version, which is the latest approved version at the time of submission.
- **FR-5** (AC-05) An application whose income is below the minimum threshold of the selected product fails with PolicyViolationException, raised by the rule engine and persisted as AUTO_REJECT with a reason code.
- **FR-6** (AC-06) An underwriter can mark each submitted document VERIFIED or REJECTED, with a reason, from a document-verification queue.
- **FR-7** (AC-07) On approval, the repayment schedule is generated using the EMI formula, and the sum of principal and interest equals total payable.
- **FR-8** (AC-08) Disbursement records the released amount and the funding source (stubbed).
- **FR-9** (AC-09) Posting a repayment reduces outstanding principal and recalculates the bucket (CURRENT, DPD-30, DPD-60, DPD-90, NPA).
- **FR-10** (AC-10) An admin can list applications, filter them by status and product, and override an AUTO_REJECT with a comment and reason code; the override is audited.
- **FR-11** (D-01) A customer can track an application: its status, missing documents, decision and reason codes.
- **FR-12** (D-02) A customer can view the repayment schedule of their loan, post a repayment, and see the updated outstanding principal and bucket.
- **FR-13** (D-03) An underwriter can open an application queue of applications awaiting work.
- **FR-14** (D-04) An underwriter can approve or reject an application in MANUAL_REVIEW with a reason, and the action is audited with user ID and timestamp.
- **FR-15** (D-05) An underwriter can override an AUTO_REJECT with a comment and reason code, and the override is audited with user ID and timestamp.
- **FR-16** (D-06) A policy editor can edit thresholds (income, age, score, tenure, rate) per product without a code change, producing a new versioned policy file that an admin approves before it becomes active.
- **FR-17** (D-07) An admin can open a portfolio dashboard showing applications and active loans by product, the NPA bucket and total overdue.
- **FR-18** (D-08) An end-of-day job recalculates the delinquency bucket of every active loan as of a given date.
- **FR-19** (D-09) No money value (principal, interest, EMI) is held, stored or computed as a floating-point number anywhere in the system.
- **FR-20** (D-10) A health endpoint is available without authentication and reports that the system is ready.

## Non-Functional Requirements

- **NFR-01** Money (principal, interest, EMI) is computed in fixed-point (BigDecimal / decimal), rounded half-up to 2 decimal places — never floating-point.
- **NFR-02** Approved policy versions and generated repayment schedules are append-only — no update or delete: 0 permitted modifications, enforced in application code and by database triggers.
- **NFR-03** Synthetic identifiers (PAN, Aadhaar) and salary documents are never written to logs: 0 occurrences of an identifier value or document filename in captured logs.
- **NFR-04** Authentication boundary enforced at controller layer on 100% of routes except login and health; underwriter actions are audited with user ID and timestamp.
- **NFR-05** Database migrations and policy migrations are append-only: 0 edits to an applied migration or approved policy file, checked by SHA-256 at startup.
- **NFR-06** Structured JSON logs, one line per request, with a request correlation ID on 100% of lines.
- **NFR-07** Health endpoint returns 200 within 1 second of a successful startup.
- **NFR-08** Architecture rules enforced as automated tests (e.g., policy version cannot be mutated; EMI invariant principal × rate × tenure equation holds): at least 3 structural tests, run on every pull request.

## Acceptance

Postconditions use the seed data and policy version 1 values from `specs/features/`. Amounts are INR.

- **FR-1** → GET /api/products with a valid token returns 200 and exactly 3 products (PERSONAL, VEHICLE, EDUCATION), each with policy_version 1; their min_income values are 25000.00, 30000.00 and 20000.00, so no two rule sets are identical.
- **FR-2** → POST /api/applications as customer user 4 (PERSONAL, amount 200000.00, tenure 24 months, age 30, income 60000.00) returns 201 with status DRAFT and required_documents ID_PROOF, ADDRESS_PROOF and SALARY_SLIP, each MISSING; a VEHICLE application lists 4 documents and an EDUCATION one lists 4.
- **FR-3** → Scoring age 40, income 100000.00 and no flags returns 740 on each of 100 repeated calls; age 30 with income 60000.00 returns 680; age 30 with income 30000.00 and prior_default returns 500.
- **FR-4** → Underwriting a submitted PERSONAL application returns AUTO_APPROVE with score 740 and reason_codes ["SCORE_MEETS_AUTO_APPROVE"] at policy_version 1; score 680 returns MANUAL_REVIEW with ["SCORE_IN_REVIEW_BAND"]; score 500 returns AUTO_REJECT with ["SCORE_BELOW_MIN"].
- **FR-5** → For PERSONAL with min_income 25000.00, income 24999.99 raises PolicyViolationException with code INCOME_BELOW_MIN in the rule engine, and POST /underwrite returns 200 with decision AUTO_REJECT, reason_codes ["INCOME_BELOW_MIN"], status REJECTED and a persisted decisions row; income 25000.00 raises nothing.
- **FR-6** → GET /api/verification-queue as underwriter user 3 lists UPLOADED documents oldest first; POST /api/documents/{id}/verify with outcome VERIFIED or REJECTED and a reason of 1 to 500 characters returns 200 and writes audit row DOCUMENT_VERIFIED or DOCUMENT_REJECTED with actor 3; a missing reason returns 422.
- **FR-7** → For an application approved for 100000.00 over 12 months at 12.00% a loan exists with emi 8884.88 and 12 schedule rows (row 1: interest 1000.00, principal 7884.88, closing 92115.12); the principal sums to 100000.00 and total_payable 106618.53 equals the sum of principal and interest.
- **FR-8** → POST /api/applications/1/disbursements with funding_source TREASURY_STUB on an approved application whose documents are all VERIFIED returns 201 with amount 100000.00, loan ACTIVE, application DISBURSED and audit row DISBURSEMENT_RECORDED; with a document not VERIFIED it returns 409 DOCUMENTS_NOT_VERIFIED.
- **FR-9** → After a repayment of 8884.88 posted on 2026-02-15 to the 100000.00 loan, outstanding_principal is 92115.12; with installment 1 unpaid the bucket at as_of 2026-03-20, 2026-04-20, 2026-05-20 and 2026-06-20 is DPD-30, DPD-60, DPD-90 and NPA; 29 days past due is CURRENT, 30 is DPD-30, 60 is DPD-60, 90 is DPD-90 and 120 is NPA.
- **FR-10** → As admin user 1 on the demo seed, GET /api/applications?status=REJECTED&product=PERSONAL returns only application 5; POST /api/applications/{id}/override on an AUTO_REJECT application with reason_code COMPENSATING_FACTORS and a comment returns 200 with status APPROVED and an audit row DECISION_OVERRIDDEN with actor 1.
- **FR-11** → Customer user 5 requesting GET /api/applications/3 receives status REJECTED, decision AUTO_REJECT, score 500 and reason_codes ["SCORE_BELOW_MIN"] with its customer-readable message; a DRAFT application without SALARY_SLIP returns missing_documents ["SALARY_SLIP"]; customer user 4 requesting application 3 receives 404.
- **FR-12** → GET /api/loans/{id}/schedule returns 12 rows for the 100000.00 loan; after POST /api/loans/{id}/repayments with amount 8884.88 the page shows outstanding principal 92,115.12 and bucket Current without a page reload.
- **FR-13** → On the demo seed, GET /api/applications?status=MANUAL_REVIEW as underwriter user 3 returns exactly application 6.
- **FR-14** → POST /api/applications/2/review as underwriter user 3 with outcome APPROVE and a reason returns 200, status APPROVED and audit row REVIEW_APPROVED with actor 3; with outcome REJECT it returns status REJECTED and audit row REVIEW_REJECTED.
- **FR-15** → POST /api/applications/{id}/override as underwriter user 3 on an AUTO_REJECT application with reason_code DATA_CORRECTION and a comment returns 200, status APPROVED and audit row DECISION_OVERRIDDEN with actor 3; a reason_code outside the policy's override list returns 422.
- **FR-16** → POST /api/policies as policy editor user 2 with PERSONAL min_income 30000.00 returns 201 with version 2, status DRAFT and a new file policy_v0002.json, while policy_v0001.json is byte-identical; GET /api/products shows 25000.00 until admin user 1 approves version 2 and 30000.00 afterwards.
- **FR-17** → On the demo seed at as_of 2026-03-20, GET /api/dashboard/portfolio as admin returns total_overdue 17769.76 and PERSONAL with 4 applications, 1 active loan and outstanding principal 100000.00; at as_of 2026-06-20 the NPA count is 1 and total_overdue is 44424.40; a non-admin token returns 403.
- **FR-18** → POST /api/admin/jobs/end-of-day with as_of 2026-03-20 as admin returns 200 with processed 2 and changed 1 for two active loans, the overdue loan reads DPD-30, an audit row EOD_RUN exists, and repeating the call returns changed 0.
- **FR-19** → A static scan of backend source and database money columns finds 0 floating-point types and 0 REAL money columns, and money values appear in JSON as strings with 2 decimal places.
- **FR-20** → GET /health without a token returns 200 with {"status":"ok"} in at most 1000 ms after the process reports ready.

## Milestones

Two sprints, as planned. The override half of FR-10 ships in M1 through FR-15; its list-and-filter half and admin override complete in M2. Features are defined in `specs/features/` (F0..F5).

- **M1** Sprint 1, features F0 to F3: platform, catalog and policy versions, apply and verification, scoring and underwriting (FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-14, FR-15, FR-16, FR-19, FR-20, NFR-01, NFR-02, NFR-03, NFR-04, NFR-05, NFR-06, NFR-07, NFR-08) — Done when: with seed users loaded, a customer applies, uploads 3 documents and submits in the browser, an underwriter verifies documents, resolves a MANUAL_REVIEW application and overrides an AUTO_REJECT with an audit row, a policy editor creates version 2 that an admin approves, and GET /health returns 200 within 1 second.
- **M2** Sprint 2, features F4 and F5: schedule, disbursement and repayment, admin dashboard and tracking (FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-17, FR-18, NFR-01, NFR-02, NFR-04) — Done when: an approved application with all documents verified is disbursed, its 12-row schedule is shown, a repayment of 8884.88 changes outstanding principal from 100000.00 to 92115.12 with the bucket recalculated, and an admin sees the portfolio dashboard and the filtered application list in the browser.

## Out of Scope

- Real bureau or credit-score integration.
- Real document OCR or extraction; document upload records metadata only and stores no file content.
- Real disbursement rails (NEFT, RTGS, IMPS); the response is stubbed.
- Real collections or recovery workflow.
- Multi-currency and foreign exchange; all amounts are INR.
- Production deployment, secret management, multi-region operation and distributed locking.
- Late fees, penal interest, prepayment rebates, foreclosure quotes, and schedule regeneration or restructuring.
- Co-applicants, editing an application after submission, and withdrawing an application.
- Token refresh, password reset, and user administration.
- A fourth product type, editing score weights through the policy editor, and rolling back an approved policy version.
- Report export, time-series trends and notifications.
- Any requirement that depends on the optional AI runtime; every FR must be met with that runtime off.

## Assumptions

Settled in `specs/app_spec.md` (Assumptions) and `specs/features/` (`FA-F<n>.<m>`); the feature spec wins where they differ.

- The role model (Customer, Underwriter, Policy editor, Admin, System scheduler) is inferred from the brief's journeys and functions.
- Both an Underwriter and an Admin may override an AUTO_REJECT; a MANUAL_REVIEW application is resolved by an Underwriter; the override sets status APPROVED.
- Policy versions are created as DRAFT by a policy editor or admin and approved only by an admin; the active version is the latest approved one at submission.
- The credit score, thresholds, rates, document checklists, reason codes, bucket boundaries (NPA from 120 days past due) and the EMI rounding rule are synthetic values chosen in the feature specs, not in the brief.
- NFR-08's "principal × rate × tenure equation" is read as the standard reducing-balance EMI formula with installments summing to total payable.
- Document status gates disbursement, not approval; underwriting is a separate explicit call after submission.
- The brief's GitLab is replaced by a personal GitHub repository and GitHub Actions; the stack is Python 3.12, FastAPI, SQLite, React and TypeScript.
