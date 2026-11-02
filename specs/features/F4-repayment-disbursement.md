# F4 — Repayment Schedule, Disbursement and Repayment

- **Feature / epic:** F4 / E4 · **Sprint:** 2 · **Parent:** `specs/app_spec.md`
- **Covers:** AC-07, AC-08, AC-09; D-02, D-08; NFR-01, NFR-02 (schedules), NFR-04 (disbursement and EOD audited), NFR-08 (EMI invariant)
- **Depends on:** F0 — `{E0-S2, contract, audit writer}`; F2 — `{E2-S3, data, document statuses}`; F3 — `{E3-S2, behavior, ApplicationApproved event}`, `{E3-S4, behavior, same event from review and override}`
- Shared conventions are in `F0-platform.md`; PERSONAL v1 rate is 12.00 % p.a. (`F1-product-catalog.md`).

## Settled assumptions

| ID | Settles | Assumption |
|----|---------|------------|
| FA-F4.1 | AC-07 EMI | `r = annual_rate_pct / 12 / 100`; `EMI = P·r·(1+r)^n / ((1+r)^n − 1)`, computed in `Decimal` and rounded `ROUND_HALF_UP` to 2 places. Rate is never 0 (F1 minimum 0.01). |
| FA-F4.2 | AC-07 rows | For installment k: `interest_k = round(opening_k × r, 2)`; for k < n, `principal_k = EMI − interest_k`; the last installment clears the balance: `principal_n = opening_n`, `installment_n = opening_n + interest_n`. `total_payable` = sum of all installments (so it can differ from `n × EMI` by a few paise). |
| FA-F4.3 | AC-07 / NFR-02 | An `ApplicationApproved` event (F3) creates one `loans` row (`PENDING_DISBURSAL`) and its schedule, once per application. Schedule rows are insert-only (triggers abort `UPDATE`/`DELETE`). There is no regeneration or correction path in this scope; a changed policy never touches existing schedules. |
| FA-F4.4 | Due dates | Schedule rows hold no dates. Installment n is due `disbursed_on` + n months, same day-of-month, clamped to month end (31 Jan → 28 Feb in 2026). Dates are derived, so rows stay immutable. |
| FA-F4.5 | AC-08 | Disbursement is triggered by `UNDERWRITER` or `ADMIN`. It releases the whole approved amount once; funding source is one of `TREASURY_STUB`, `PARTNER_BANK_STUB`. It requires status `APPROVED`, every required document `VERIFIED`, and an existing schedule. `disbursed_on` is optional (default: today, UTC). |
| FA-F4.6 | AC-09 allocation | A repayment goes to the oldest installment with an unpaid amount first, interest before principal within each installment, then on to later installments. The amount must be `≥ 0.01` and `≤` the total unpaid across all installments; posting is by the owning customer; `posted_on` must be `≥ disbursed_on`. Paying everything sets the loan `CLOSED`. |
| FA-F4.7 | AC-09 buckets | `DPD` = days from the earliest due date among installments that are unpaid and due on or before `as_of`, to `as_of`; 0 if none. `CURRENT` 0–29, `DPD-30` 30–59, `DPD-60` 60–89, `DPD-90` 90–119, `NPA` ≥ 120 (the brief lists NPA separately from DPD-90). |
| FA-F4.8 | As-of date | `as_of` is an explicit input everywhere (EOD body, posting uses `posted_on`, dashboard query) and defaults to today UTC, so tests are deterministic. |
| FA-F4.9 | Balances | `outstanding_principal` = principal − sum of principal paid. A recorded repayment and its allocations are insert-only. |
| FA-F4.10 | Data | Applications approved before F4 ships get no loan; the demo seed (F5) is created after F4. |

## Entities

| Entity | Fields |
|---|---|
| `loans` | id, application_id (unique), principal, annual_rate_pct, tenure_months, emi, total_payable, status (`PENDING_DISBURSAL`, `ACTIVE`, `CLOSED`), disbursed_on?, outstanding_principal, bucket, bucket_as_of? |
| `schedule_rows` | loan_id, installment_no (PK pair), opening_principal, principal_component, interest_component, installment_amount, closing_principal |
| `disbursements` | id, loan_id (unique), amount, funding_source, disbursed_on, recorded_by, recorded_at |
| `repayments` | id, loan_id, amount, posted_on, posted_by, posted_at |
| `repayment_allocations` | repayment_id, installment_no, interest_paid, principal_paid |

## Endpoints

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/loans/{id}` | owner, UNDERWRITER, ADMIN | principal, emi, total_payable, outstanding_principal, bucket, status |
| GET | `/api/loans/{id}/schedule` | owner, UNDERWRITER, ADMIN | rows with derived `due_date` (null before disbursement) and `PAID`/`PARTIAL`/`DUE`/`OVERDUE`; `?as_of=` |
| POST | `/api/applications/{id}/disbursements` | UNDERWRITER, ADMIN | `{funding_source, disbursed_on?}` |
| POST | `/api/loans/{id}/repayments` | owner (CUSTOMER) | `{amount, posted_on?}` |
| POST | `/api/admin/jobs/end-of-day` | ADMIN | `{as_of?}` → `{processed, changed}` |

## Stories

### E4-S1 — Repayment schedule on approval (layer: Service)
Depends on: E3-S2, E3-S4 (behavior: `ApplicationApproved`). Traces: AC-07, NFR-01, NFR-02, NFR-08.
- **E4-S1-AC1** — *Given* an application approved for `"100000.00"`, 12 months, PERSONAL at 12.00 %, *when* approval happens by auto-approve, manual review or override, *then* a loan `PENDING_DISBURSAL` exists with `emi` `"8884.88"` and exactly 12 schedule rows.
- **E4-S1-AC2** — *Given* that loan, *then* row 1 is interest `"1000.00"`, principal `"7884.88"`, closing `"92115.12"`; row 2 is interest `"921.15"`, principal `"7963.73"`, closing `"84151.39"`.
- **E4-S1-AC3** — *Given* the 12 rows, *then* the sum of principal is exactly `"100000.00"`, row 12 closing is `"0.00"`, total interest is `"6618.53"`, and `total_payable` is `"106618.53"`, equal to both the sum of installments and principal plus interest.
- **E4-S1-AC4** — *Given* the 12 rows, *then* rows 1–11 have installment `"8884.88"` and row 12 has interest `"87.97"`, principal `"8796.88"` and installment `"8884.85"`.
- **E4-S1-AC5** — *Given* an existing schedule, *when* `UPDATE` or `DELETE` hits `schedule_rows`, *then* the database aborts; *when* `ApplicationApproved` fires again for the same application, *then* no second loan or schedule is created.
- **E4-S1-AC6** — *Given* amounts `10000.00`, `123456.78`, `1500000.00`, rates `8.50`, `9.50`, `12.00`, `36.00` and tenures 12, 36, 120, *when* each schedule is generated, *then* the principal sum equals the amount and `total_payable` equals principal plus interest for every combination.

### E4-S2 — Disbursement (layer: Service)
Depends on: E4-S1 (data: loan and schedule), E2-S3 (data: verified documents). Traces: AC-08, NFR-04.
- **E4-S2-AC1** — *Given* application 1 `APPROVED` for `"100000.00"` with 3 `VERIFIED` documents, *when* UNDERWRITER user 3 POSTs `{funding_source:"TREASURY_STUB", disbursed_on:"2026-01-15"}`, *then* 201 with `amount` `"100000.00"`, the funding source, loan `ACTIVE`, application `DISBURSED`, and an audit row `DISBURSEMENT_RECORDED`.
- **E4-S2-AC2** — *Given* `SALARY_SLIP` still `UPLOADED`, *when* disbursement is posted, *then* 409 `DOCUMENTS_NOT_VERIFIED` listing `["SALARY_SLIP"]` and no loan change.
- **E4-S2-AC3** — *Given* a disbursed application, *when* posted again, *then* 409 `ALREADY_DISBURSED`; *given* an application not `APPROVED`, *then* 409 `NOT_APPROVED`.
- **E4-S2-AC4** — *Given* `funding_source` `"CASH"`, *then* 422; *given* a CUSTOMER token, *then* 403.
- **E4-S2-AC5** — *Given* `disbursed_on` 2026-01-15, *when* the schedule is read, *then* row 1 is due 2026-02-15 and row 12 is due 2027-01-15; *given* `disbursed_on` 2026-01-31, *then* row 1 is due 2026-02-28.

### E4-S3 — Repayment posting and buckets (layer: Service)
Depends on: E4-S2 (behavior: active loan). Traces: AC-09, NFR-01.
- **E4-S3-AC1** — *Given* the loan disbursed 2026-01-15, *when* its customer posts `"8884.88"` on 2026-02-15, *then* 201, allocation to installment 1 is interest `"1000.00"` and principal `"7884.88"`, `outstanding_principal` is `"92115.12"` and bucket `CURRENT`.
- **E4-S3-AC2** — *Given* the same loan, *when* the customer posts `"5000.00"` on 2026-02-15, *then* interest `"1000.00"` and principal `"4000.00"` are applied, `outstanding_principal` is `"96000.00"`, and installment 1 is `PARTIAL` with `"3884.88"` of principal still due.
- **E4-S3-AC3** — *Given* DPD values 29, 30, 59, 60, 89, 90, 119, 120, *when* bucketed, *then* `CURRENT`, `DPD-30`, `DPD-30`, `DPD-60`, `DPD-60`, `DPD-90`, `DPD-90`, `NPA`.
- **E4-S3-AC4** — *Given* installment 1 unpaid and due 2026-02-15, *when* the bucket is computed at `as_of` 2026-03-20, 2026-04-20, 2026-05-20, 2026-06-20, *then* it is `DPD-30` (33 days), `DPD-60` (64), `DPD-90` (94), `NPA` (125).
- **E4-S3-AC5** — *Given* installments 1 and 2 unpaid at 2026-03-20 (bucket `DPD-30`), *when* the customer posts `"8884.88"` that day, *then* installment 1 is cleared, the oldest unpaid is installment 2 due 2026-03-15 (5 days), the bucket is recalculated to `CURRENT` and `outstanding_principal` is `"92115.12"`.
- **E4-S3-AC6** — *Given* an amount of `"0.00"`, or above the total still unpaid, *then* 422 `AMOUNT_EXCEEDS_REMAINING` or `VALIDATION_ERROR`; *given* a loan not yet disbursed, *then* 409 `NOT_DISBURSED`; *given* another customer, *then* 404; *given* the full remaining amount, *then* the loan is `CLOSED` with `outstanding_principal` `"0.00"`.

### E4-S4 — End-of-day recalculation and repayment UI (layer: API, UI)
Depends on: E4-S3 (contract: bucket function). Traces: D-08, D-02, NFR-04.
- **E4-S4-AC1** — *Given* two `ACTIVE` loans, one with installment 1 unpaid since 2026-02-15 and one fully current, *when* ADMIN POSTs `{as_of:"2026-03-20"}` to the end-of-day job, *then* 200 `{processed:2, changed:1}`, the first loan reads `DPD-30`, and an audit row `EOD_RUN` exists.
- **E4-S4-AC2** — *Given* the same `as_of` posted again, *then* `changed` is 0; *given* `CLOSED` or `PENDING_DISBURSAL` loans, *then* they are not counted in `processed`.
- **E4-S4-AC3** — *Given* a non-ADMIN token, *then* 403; *given* `as_of` `"2026-13-40"`, *then* 422.
- **E4-S4-AC4** — *Given* a customer on 1280×800 opening their loan, *then* a 12-row schedule table shows Paid, Due or Overdue badges; at 375×812 the rows stack as cards with no horizontal scroll.
- **E4-S4-AC5** — *Given* the repayment form, *when* the customer posts `8884.88`, *then* the page shows outstanding "₹92,115.12" and bucket "Current" without a reload; an amount above what remains shows an inline error before submit.

## AC-tagged test list

| Test | Level | Tags |
|---|---|---|
| `unit/test_emi.py::test_AC07_emi_100000_12pct_12m` | Unit | AC-07 · E4-S1-AC1 |
| `unit/test_schedule.py::test_AC07_first_two_rows` | Unit | AC-07 · E4-S1-AC2 |
| `unit/test_schedule.py::test_AC07_principal_plus_interest_equals_total_payable` | Unit | AC-07, NFR-01 · E4-S1-AC3 |
| `unit/test_schedule.py::test_AC07_last_installment_clears_balance` | Unit | AC-07 · E4-S1-AC4 |
| `repo/test_schedule_append_only.py::test_NFR02_schedule_rows_immutable` | Integration | NFR-02 · E4-S1-AC5 |
| `architecture/test_emi_invariant.py::test_NFR08_emi_invariant_holds` | Architecture | AC-07, NFR-08 · E4-S1-AC6 |
| `api/test_disbursement.py::test_AC08_records_amount_and_funding_source` | API | AC-08, NFR-04 · E4-S2-AC1 |
| `api/test_disbursement.py::test_AC08_blocked_until_documents_verified` | API | AC-08 · E4-S2-AC2 |
| `api/test_disbursement.py::test_AC08_once_and_only_when_approved` | API | AC-08 · E4-S2-AC3 |
| `api/test_disbursement.py::test_AC08_funding_source_and_role_guards` | API | AC-08 · E4-S2-AC4 |
| `unit/test_due_dates.py::test_AC08_due_dates_derived_and_clamped` | Unit | AC-08 · E4-S2-AC5 |
| `api/test_repayment.py::test_AC09_full_installment_reduces_principal` | API | AC-09 · E4-S3-AC1 |
| `api/test_repayment.py::test_AC09_partial_payment_allocation` | API | AC-09 · E4-S3-AC2 |
| `unit/test_buckets.py::test_AC09_bucket_boundaries` | Unit | AC-09 · E4-S3-AC3 |
| `unit/test_buckets.py::test_AC09_bucket_progression_by_as_of` | Unit | AC-09 · E4-S3-AC4 |
| `api/test_repayment.py::test_AC09_posting_recalculates_bucket` | API | AC-09 · E4-S3-AC5 |
| `api/test_repayment.py::test_AC09_amount_limits_ownership_and_closure` | API | AC-09 · E4-S3-AC6 |
| `api/test_eod.py::test_D08_recalculates_active_loans` | API | D-08, NFR-04 · E4-S4-AC1 |
| `api/test_eod.py::test_D08_idempotent_and_scoped_to_active` | API | D-08 · E4-S4-AC2 |
| `api/test_eod.py::test_D08_admin_only_and_valid_date` | API | D-08 · E4-S4-AC3 |
| `e2e/repayment.spec.ts::D02 schedule table desktop and cards mobile` | Playwright | D-02 · E4-S4-AC4 |
| `e2e/repayment.spec.ts::D02 post repayment updates balance and bucket` | Playwright | D-02, AC-09 · E4-S4-AC5 |

## Out of scope for F4

Late fees and penal interest; prepayment rebates or foreclosure quotes; schedule regeneration or restructuring; real disbursement rails; collections.
