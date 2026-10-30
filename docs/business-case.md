# TrueLend — Business Case (BC-AINE-003)

Source: `docs/brief/AI Native Engineer Capstone - BC-003 TrueLend.pdf` (Sections 3, 5 and 6), restated in our own words. Every gap, inference and project decision is recorded once, in [Assumptions in `specs/app_spec.md`](../specs/app_spec.md#assumptions); this document does not keep a separate list.

## Problem

Horizon Bank wants a configurable loan-origination platform that lets the business launch new loan products without code changes. It needs the whole lifecycle — application, underwriting, disbursement, repayment — with product rules held in versioned policy data, so a new product or a changed threshold is a policy edit rather than a code change.

A second constraint is part of the problem itself: the system must be built with no hand-written production code. Claude Code agents write every line of code, tests and migrations under human supervision, so quality has to come from specs, guardrails and review rather than from the author's own typing.

## Target users

Roles are inferred from the brief's journeys and internal functions; it defines no role model (Assumption 9).

| User | What they need |
|------|----------------|
| Customer (applicant) | Pick a loan product, submit an application with documents, see status, missing documents, decision and reason codes, view the repayment schedule and post repayments. |
| Underwriter | Work an application queue, verify or reject each document with a reason, resolve MANUAL_REVIEW applications with a reason, override an AUTO_REJECT; all audited. |
| Policy editor | Change thresholds (income, age, score, tenure, rate) per product and produce a new versioned policy file without a code change. |
| Admin | See the portfolio by product, NPA bucket and total overdue; list and filter applications; override an AUTO_REJECT with comment and reason code, audited. |
| System (scheduler) | Run the end-of-day job that recalculates delinquency buckets across active loans. |

## Success metrics

The brief gives no business KPIs, only acceptance criteria, non-functional requirements and one timing figure (health endpoint within 1 second). Success is therefore measured against those:

- All ten acceptance criteria (AC-01..AC-10) pass, and each has at least one test that references its AC identifier.
- All eight non-functional requirements (NFR-01..NFR-08) hold, with the architectural ones enforced by automated tests.
- A product's thresholds can be changed by publishing a new policy version, with no code change.
- Every underwriting decision carries reason codes from the policy version that produced it.
- Underwriter actions and overrides are recorded with user ID and timestamp.
- The repository shows an agent-led trail: PR-only merges, no direct commits to main, no hand-written production code.

## Domain rules

- **Currency.** All amounts are INR.
- **Products.** At least three: Personal, Vehicle, Education. Each has its own rule set, read from a versioned policy file.
- **Policy versions** are append-only once approved. Editing thresholds produces a new version; old versions are never changed or deleted. Database and policy migrations are append-only too. The active version is the latest approved one at the time an application is submitted.
- **Application intake.** Applying generates a required-document checklist specific to the product.
- **Credit score.** A stub that is deterministic: the same age, income and credit-history flags always give the same score. No real bureau.
- **Underwriting decision.** AUTO_APPROVE, AUTO_REJECT or MANUAL_REVIEW, with reason codes that reference the active policy version.
- **Minimum income.** An application with income below the product's minimum threshold triggers `PolicyViolationException` in the rule engine and is recorded as AUTO_REJECT with a reason code.
- **Manual review.** An underwriter approves or rejects a MANUAL_REVIEW application with a reason.
- **Document verification.** An underwriter marks each document VERIFIED or REJECTED and gives a reason.
- **Override.** An underwriter or an admin may override an AUTO_REJECT with a comment and reason code; the override is audited.
- **Repayment schedule.** Generated on approval using the EMI formula. Principal plus interest across the schedule equals total payable. Schedules are append-only.
- **Money.** Principal, interest and EMI use fixed-point decimal arithmetic, never floating point.
- **Disbursement.** Records the amount released and the funding source (stubbed).
- **Repayment posting.** Reduces outstanding principal and recalculates the delinquency bucket: CURRENT, DPD-30, DPD-60, DPD-90 or NPA.
- **Sensitive data.** Synthetic identifiers (PAN, Aadhaar) and salary documents never appear in logs. All data is synthetic.

## Value proposition

- **For the bank:** launch products and change thresholds through policy rather than code, with every decision tied to the policy version that produced it and underwriter actions and overrides recorded with user and time.
- **For customers:** a self-service journey with visible status, missing documents, decisions and reasons.
- **For underwriters and admins:** one place for document checks, decision review, overrides and a portfolio view.
- **For the engineering practice:** a demonstration that a lending system can be built end to end by supervised agents, with specs as the source of truth and guardrails as the quality mechanism.

## Out of scope

Real bureau or credit-score integration; real document OCR/extraction; real disbursement rails (NEFT/RTGS/IMPS, stubbed); real collections/recovery; multi-currency/FX; production deployment, secret management, multi-region and distributed locking.
