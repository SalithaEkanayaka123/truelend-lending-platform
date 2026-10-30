# TrueLend — Application Spec (root)

Source of truth: `docs/brief/AI Native Engineer Capstone - BC-003 TrueLend.pdf`. Business context: `docs/business-case.md`. Where this spec and code disagree, this spec wins (Spec-Is-Truth).

Conventions: **AC-NN** and **NFR-NN** are the brief's own identifiers and are never added to. Scope the brief lists without an AC is covered by derived scenarios **D-nn**. Every choice the brief does not make is listed under [Assumptions](#assumptions), the single list for the project.

## Roles

The brief defines no role model; these roles are inferred from its journeys (§6.1) and internal functions (§6.2). Capabilities describe which journey a role performs (see Assumption 9).

| Role | Capabilities |
|------|--------------|
| Customer | Apply, upload required documents (stub), track status/missing documents/decision/reason codes, view repayment schedule, post a repayment. |
| Underwriter | Application queue, document verification (VERIFIED/REJECTED with reason), decision review (approve/reject a MANUAL_REVIEW application with reason), override an AUTO_REJECT. All audited. |
| Policy editor | Edit per-product thresholds (income, age, score, tenure, rate); each save produces a new versioned policy file. |
| Admin | List applications, filter by status/product, override an AUTO_REJECT with comment and reason code (audited), portfolio dashboard (by product, NPA bucket, total overdue). |
| System (scheduler) | End-of-day bucket recalculation across active loans. |

## Lifecycle

Stage order is inferred from the brief; only the dependencies the brief states, or the project owner decided (Assumptions 1–5), are binding.

- **Catalog:** products and rule sets are read from the active versioned policy.
- **Apply:** the customer picks a product, a required-document checklist is generated, documents are uploaded (stub), and the application is submitted.
- **Score and underwrite:** a deterministic score is computed, then the rule engine returns AUTO_APPROVE, AUTO_REJECT or MANUAL_REVIEW with reason codes. An income below the product minimum raises `PolicyViolationException` in the rule engine, and the application is persisted as AUTO_REJECT with a reason code.
- **Verify documents:** an underwriter marks each document VERIFIED or REJECTED with reason.
- **Resolve:** an underwriter approves or rejects a MANUAL_REVIEW application with a reason. An underwriter or an admin may override an AUTO_REJECT with a comment and reason code. Every such action is audited.
- **Schedule, disburse, repay:** on approval the EMI schedule is generated; disbursement records released amount and stubbed funding source; repayments reduce outstanding principal and recalculate the bucket; an end-of-day job recalculates buckets across active loans.

## Acceptance criteria

Original brief IDs are kept. Each AC needs at least one test that references its AC-NN identifier. Currency is INR (Assumption 5).

### AC-01 Product catalog
- **Given** an active versioned policy file, **When** the catalog is requested, **Then** it contains at least 3 products, including Personal, Vehicle and Education.
- **Given** any two products in the policy file, **When** their rule sets are compared, **Then** each is its own entry and the two differ in at least one threshold.

### AC-02 Apply and document checklist
- **Given** a customer and a selected product, **When** the customer applies, **Then** an application is created.
- **Given** that application, **When** it is created, **Then** a required-document checklist specific to the selected product is generated.

### AC-03 Credit-scoring stub
- **Given** age, income and credit-history flags, **When** the score is computed, **Then** a score is returned.
- **Given** identical inputs, **When** the score is computed repeatedly, **Then** the same score is returned every time.

### AC-04 Underwriting decision
- **Given** a scored application, **When** underwriting runs, **Then** the decision is exactly one of AUTO_APPROVE, AUTO_REJECT or MANUAL_REVIEW.
- **Given** an application that meets the active policy's auto-approve rule, **When** underwriting runs, **Then** the decision is AUTO_APPROVE.
- **Given** an application that meets the active policy's auto-reject rule, **When** underwriting runs, **Then** the decision is AUTO_REJECT.
- **Given** an application that meets neither rule, **When** underwriting runs, **Then** the decision is MANUAL_REVIEW.
- **Given** any decision, **When** it is returned, **Then** it carries reason codes defined in the active policy version and identifies that version.
- **Given** a policy version approved after an application was submitted, **When** that application is underwritten, **Then** the version used is the latest approved at submission (Assumption 3).

### AC-05 Minimum-income violation
- **Given** a selected product with a minimum income threshold, **When** an application has income below that threshold, **Then** the rule engine raises `PolicyViolationException`.
- **Given** that exception, **When** the application is processed, **Then** it is persisted as AUTO_REJECT with a reason code (Assumption 4).
- **Given** an application whose income equals the threshold, **When** it is evaluated, **Then** no `PolicyViolationException` is raised.

### AC-06 Document verification queue
- **Given** an application with submitted documents in the verification queue, **When** an underwriter reviews a document, **Then** they can mark it VERIFIED or REJECTED.
- **Given** a document being marked, **When** the underwriter records the outcome, **Then** a reason is recorded with it.

### AC-07 Repayment schedule
- **Given** an approved application, **When** the repayment schedule is generated, **Then** it uses the EMI formula.
- **Given** a generated schedule, **When** principal and interest are summed, **Then** the sum equals total payable.

### AC-08 Disbursement
- **Given** an approved application, **When** disbursement is triggered, **Then** the released amount and the funding source (stubbed) are recorded.

### AC-09 Repayment posting and buckets
- **Given** an active loan with outstanding principal, **When** a repayment is posted, **Then** outstanding principal is reduced.
- **Given** a loan after a posting or end-of-day run, **When** the bucket is recalculated, **Then** it is one of CURRENT, DPD-30, DPD-60, DPD-90 or NPA.

### AC-10 Admin list, filter, override
- **Given** existing applications, **When** an admin lists them, **Then** they can filter by status and by product.
- **Given** an application with decision AUTO_REJECT, **When** an admin overrides it with a comment and a reason code, **Then** the override is applied and an audit record is written.

## Derived scenarios (brief scope without an AC)

These cover functions the brief lists in §5.2, §6.1 and §6.2 and decisions taken by the project owner. They add no AC or NFR IDs.

- **D-01 Track (§6.1).** Given a submitted application, when the customer views it, then status, missing documents, decision and reason codes are shown.
- **D-02 Repay view (§6.1).** Given a loan with a schedule, when the customer views it, then the schedule is shown and, after a posting, the updated outstanding and bucket.
- **D-03 Underwriter queue (§6.2).** Given applications awaiting work, when an underwriter opens the workbench, then an application queue is shown.
- **D-04 Manual-review resolution.** Given an application in MANUAL_REVIEW, when an underwriter approves or rejects it with a reason, then its status changes accordingly, approval triggers schedule generation (AC-07), and the action is audited with user ID and timestamp.
- **D-05 Underwriter override.** Given an application with decision AUTO_REJECT, when an underwriter overrides it with a comment and reason code, then the override is applied and audited with user ID and timestamp.
- **D-06 Policy edit (§6.2).** Given a product's thresholds (income, age, score, tenure, rate), when a policy editor saves a change, then a new versioned policy file is produced without a code change and earlier versions are unchanged.
- **D-07 Admin dashboard (§6.2).** Given loans in the portfolio, when an admin opens the dashboard, then the portfolio is shown by product, with the NPA bucket and total overdue.
- **D-08 End-of-day recalculation (§6.2).** Given active loans, when the end-of-day job runs, then every active loan's bucket is recalculated.
- **D-09 Money precision (NFR-01).** Given the money code paths, when the test suite or a static check runs, then no floating-point type is used for principal, interest or EMI (Assumption 15).
- **D-10 Health (NFR-07).** Given the process has reported ready, when the health endpoint is requested, then it returns 200 within 1000 ms (Assumption 16).

## Non-functional requirements

Wording is the brief's, verbatim (§5.2; numbering confirmed against the rendered PDF).

| ID | Requirement |
|----|-------------|
| NFR-01 | Money (principal, interest, EMI) is computed in fixed-point (BigDecimal / decimal) — never floating-point |
| NFR-02 | Approved policy versions and generated repayment schedules are append-only — no update or delete |
| NFR-03 | Synthetic identifiers (PAN, Aadhaar) and salary documents are never written to logs |
| NFR-04 | Authentication boundary enforced at controller layer; underwriter actions are audited with user ID and timestamp |
| NFR-05 | Database migrations and policy migrations are append-only |
| NFR-06 | Structured JSON logs with request correlation IDs |
| NFR-07 | Health endpoint returns 200 within 1 second of a successful startup |
| NFR-08 | Architecture rules enforced as automated tests (e.g., policy version cannot be mutated; EMI invariant principal × rate × tenure equation holds) |

## Delivery requirements (brief §8.1)

- Deployable locally with a single command and a README quick-start.
- Seed data: 3 products plus sample applications (synthetic only).
- Per-feature specs with explicit Acceptance Criteria sections: product-catalog, application-intake, underwriting, repayment, disbursement.
- Tests tagged with AC IDs; every AC has at least one.

## Out of scope

Real bureau/credit-score integration; real document OCR/extraction; real disbursement rails (NEFT/RTGS/IMPS — stub the response); real collections/recovery workflow; multi-currency/FX; production deployment, secret management, multi-region, distributed locking.

## Assumptions

The single assumptions list for the project; `docs/business-case.md` links here.

### Decided by the project owner (not in the brief)

1. **Overrides.** Both an Underwriter and an Admin may override an AUTO_REJECT; every override is audited with user ID and timestamp.
2. **Manual review.** A MANUAL_REVIEW application is resolved by an Underwriter who approves or rejects it with a reason; the action is audited.
3. **Active policy.** The active policy version is the latest approved version at the time the application is submitted.
4. **Policy violation.** `PolicyViolationException` is raised by the rule engine and persisted as AUTO_REJECT with a reason code.
5. **Currency.** All amounts are INR.
6. **NFR-08 invariant.** The brief's "principal × rate × tenure equation" is not a formula; it is read as the standard (reducing-balance) EMI formula, with the installments summing to total payable.
7. **NFR numbering.** NFR-01..NFR-08 were checked against the rendered PDF (pages 3–4) and match.
8. **Stack and hosting.** Python 3.12 / FastAPI / SQLite / React; `PolicyViolationException` is kept as the domain error name; the brief's GitLab is replaced by a personal GitHub repo and GitHub Actions.

### Inferred, not stated in the brief

9. **Roles.** The role model is inferred (Policy editor and System are functions the brief names, not roles). The brief requires only an authentication boundary (NFR-04); enforcing per-role access comes from the project instructions.
10. **Workflow order.** The order of stages in the Lifecycle is inferred, except where Assumptions 1–4 bind it.

### Open (resolve in the per-feature specs)

11. **Policy contents.** Threshold values, the score scale and formula, the score cut-offs behind the auto-approve and auto-reject rules, the reason-code vocabulary and the per-product checklists are not in the brief; they will be synthetic and held in the policy file.
12. **Income.** Whether income is monthly or annual is not stated (AC-05).
13. **Policy lifecycle.** Whether a saved policy version is approved at once or needs an approval step and who approves it, what "policy migrations" means separately from a new version, and how a wrong schedule is corrected under append-only (NFR-02, NFR-05).
14. **Application fields.** Requested amount, tenure and the source of the rate are not defined (AC-07).
15. **Money format.** Stored as integer minor units or text and serialised as strings in JSON, so no float is introduced between database, API and UI (NFR-01).
16. **Health timing.** The health path is unspecified; the 1-second limit is read as measured from when the process reports ready (NFR-07).
17. **Overrides and queue.** Application status after an override or a manual-review decision; the override reason-code vocabulary; audit record contents (assumed user ID, timestamp, comment, reason code, before and after values); queue contents and ordering; filter combination and pagination; the definition of "total overdue".
18. **Documents.** Whether upload stores file content or metadata only; accepted types; whether a document status gates approval; whether a reason is required for VERIFIED as well as REJECTED (AC-06); what counts as a salary document in logs (NFR-03).
19. **Scoring.** The meaning of the credit-history flags and whether the score depends on all three inputs (AC-03).
20. **EMI and schedule.** The rounding rule, the definition of total payable and the last-installment adjustment (AC-07).
21. **Disbursement.** Who triggers it, funding-source values, and whether it may be partial or repeated (AC-08).
22. **Buckets and repayment.** Days-past-due boundaries, due-date rules, an injectable as-of date for deterministic end-of-day tests, allocation between principal and interest, partial and over-payment, and loan closure (AC-09).
23. **Audit, auth and logs.** Authentication mechanism, the full list of audited actions (including whether policy edits are audited), the log-scan formats for synthetic PAN/Aadhaar, and the correlation-ID fields (NFR-03, NFR-04, NFR-06).
24. **Deferred.** Detail for AC-02, AC-03, AC-06..AC-10 and NFR-02..NFR-06 is deferred to the per-feature specs.
