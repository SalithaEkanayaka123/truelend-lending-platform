# F5 — Admin Dashboard, Application List and Customer Tracking

- **Feature / epic:** F5 / E5 · **Sprint:** 2 · **Parent:** `specs/app_spec.md`
- **Covers:** AC-10 (list and filter half); D-01, D-03, D-07; NFR-04 (role scoping); demo seed required by brief §8.1
- **Depends on:** F2 — `{E2-S1, contract, application detail endpoint}`; F3 — `{E3-S2, data, decisions}`; F4 — `{E4-S3, contract, bucket function}`, `{E4-S4, data, loans and schedules}`
- Shared conventions are in `F0-platform.md`; amounts and schedules follow `F4-repayment-disbursement.md`.

## Settled assumptions

| ID | Settles | Assumption |
|----|---------|------------|
| FA-F5.1 | AC-10 list | Filters `status` and `product` combine with AND. Results are ordered by id descending and paginated (F0). An unknown `status` or `product` value is a 422. Customers always see only their own applications; `UNDERWRITER` and `ADMIN` see all. |
| FA-F5.2 | D-03 | The underwriter's application queue is this list with `status=MANUAL_REVIEW` (or `SUBMITTED`); there is no separate endpoint. |
| FA-F5.3 | D-07 | "Total overdue" = sum of the unpaid amount (interest plus principal) of every installment due on or before `as_of`, across `ACTIVE` loans. The dashboard recomputes each loan's bucket at `as_of` with the F4 function; it does not read the stored bucket. |
| FA-F5.4 | D-07 | Per product the dashboard returns: number of applications (all statuses), number of `ACTIVE` loans, outstanding principal of `ACTIVE` loans, and overdue amount. The NPA block counts loans in bucket `NPA` and their outstanding principal. Only `ADMIN` may read it. |
| FA-F5.5 | D-01 | Tracking uses `GET /api/applications/{id}` (F2). Each reason code is returned with its customer-readable message from the policy version pinned on the application. |
| FA-F5.6 | Seed | With `TRUELEND_SEED_DEMO=1` (set by the single-command run script) and an empty applications table, startup creates the 7 demo applications below through the normal services, so decisions, loans and schedules are real. A second start adds nothing. |

### Demo seed (synthetic)

| id | Owner | Product | Amount | Tenure | Age | Monthly income | Flags | Resulting state |
|---|---|---|---|---|---|---|---|---|
| 1 | user 4 | PERSONAL | 200000.00 | 24 | 30 | 60000.00 | none | `SUBMITTED` |
| 2 | user 4 | PERSONAL | 150000.00 | 12 | 30 | 60000.00 | none | `SUBMITTED` |
| 3 | user 5 | VEHICLE | 500000.00 | 36 | 30 | 35000.00 | prior_default | `REJECTED` (score 500, `SCORE_BELOW_MIN`) |
| 4 | user 5 | EDUCATION | 300000.00 | 60 | 30 | 60000.00 | none | `APPROVED` (score 680, `AUTO_APPROVE`) |
| 5 | user 5 | PERSONAL | 100000.00 | 12 | 30 | 24000.00 | none | `REJECTED` (`INCOME_BELOW_MIN`) |
| 6 | user 5 | VEHICLE | 800000.00 | 48 | 35 | 50000.00 | none | `MANUAL_REVIEW` (score 670) |
| 7 | user 4 | PERSONAL | 100000.00 | 12 | 40 | 100000.00 | none | `DISBURSED` 2026-01-15, `TREASURY_STUB`, loan 1 |

## Endpoints

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/applications` | CUSTOMER (own), UNDERWRITER, ADMIN | `?status=&product=&limit=&offset=`; item = `{id, product_type, status, requested_amount, decision?, created_at}` |
| GET | `/api/dashboard/portfolio` | ADMIN | `?as_of=` → `{as_of, by_product[], buckets{}, npa{count, outstanding_principal}, total_overdue}` |
| GET | `/api/applications/{id}` | owner, UNDERWRITER, ADMIN | defined in F2; F5 verifies the tracking view |

No new tables; both views are read models over F2–F4 data.

## Stories

### E5-S1 — Application list, filters, queue (layer: API)
Depends on: E2-S1 (contract: application shape). Traces: AC-10, D-03, NFR-04.
- **E5-S1-AC1** — *Given* the demo seed, *when* ADMIN GETs `/api/applications?status=REJECTED`, *then* `items` have ids `[5, 3]` and `total` 2.
- **E5-S1-AC2** — *Given* the seed, *when* ADMIN GETs `product=PERSONAL`, *then* ids `[7, 5, 2, 1]`; with `status=REJECTED&product=PERSONAL`, *then* `[5]`.
- **E5-S1-AC3** — *Given* the seed, *when* ADMIN GETs `?limit=2&offset=2`, *then* ids `[5, 4]` with `total` 7; *when* `limit=101`, *then* 422.
- **E5-S1-AC4** — *Given* UNDERWRITER user 3, *when* they GET `status=MANUAL_REVIEW`, *then* ids `[6]`.
- **E5-S1-AC5** — *Given* customer user 4, *when* they GET the list, *then* ids `[7, 2, 1]` with `total` 3; *given* `status=FOO`, *then* 422.

### E5-S2 — Portfolio dashboard API (layer: Service)
Depends on: E4-S3 (contract: bucket function), E4-S4 (data: loans). Traces: D-07.
- **E5-S2-AC1** — *Given* the seed and `as_of` 2026-03-20, *when* ADMIN GETs the dashboard, *then* PERSONAL shows 4 applications, 1 active loan, outstanding `"100000.00"`, overdue `"17769.76"`; VEHICLE shows 2, 0, `"0.00"`, `"0.00"`; EDUCATION shows 1, 0, `"0.00"`, `"0.00"`.
- **E5-S2-AC2** — *Given* the same request, *then* `total_overdue` is `"17769.76"` (installments due 2026-02-15 and 2026-03-15, each `"8884.88"`), loan 1 is in `DPD-30`, and `npa` is `{count:0, outstanding_principal:"0.00"}`.
- **E5-S2-AC3** — *Given* `as_of` 2026-06-20, *then* loan 1 is `NPA`, `npa` is `{count:1, outstanding_principal:"100000.00"}` and `total_overdue` is `"44424.40"` (installments 1–5).
- **E5-S2-AC4** — *Given* a database with no loans, *then* every money value is `"0.00"` and every count is 0.
- **E5-S2-AC5** — *Given* a non-ADMIN token, *then* 403; *given* `as_of` `"2026-02-30"`, *then* 422.

### E5-S3 — Customer tracking (layer: API, UI)
Depends on: E3-S2 (data: decisions), E2-S3 (data: document statuses). Traces: D-01.
- **E5-S3-AC1** — *Given* customer user 4 and application 2 (`SUBMITTED`), *when* they GET it, *then* status is `SUBMITTED`, all 3 documents are `UPLOADED`, `missing_documents` is `[]` and `decision` is null.
- **E5-S3-AC2** — *Given* customer user 5 and application 3, *when* they GET it, *then* `decision` is `AUTO_REJECT`, `score` 500, `reason_codes` `["SCORE_BELOW_MIN"]` with its policy-version-1 message, and status `REJECTED`.
- **E5-S3-AC3** — *Given* a `DRAFT` application with `SALARY_SLIP` not uploaded, *then* `missing_documents` is `["SALARY_SLIP"]`.
- **E5-S3-AC4** — *Given* customer user 4 and application 7, *then* the response carries `loan_id` 1; *given* customer user 4 requesting application 3, *then* 404.
- **E5-S3-AC5** — *Given* a customer on a 375×812 viewport opening application 3, *then* a status stepper (Submitted, Underwriting, Decision, Disbursed, Repaying) highlights the current step, reasons appear in plain language, and nothing scrolls horizontally; for application 2 a missing-documents panel offers an upload action when applicable.

### E5-S4 — Admin dashboard UI and demo seed (layer: UI, Config)
Depends on: E5-S1, E5-S2 (contract: endpoints). Traces: AC-10, D-07, brief §8.1 seed data; consumer-facing design bar.
- **E5-S4-AC1** — *Given* an empty database and `TRUELEND_SEED_DEMO=1`, *when* the app starts, *then* the 7 seed applications exist with the states in the seed table; *when* it starts again, *then* there are still 7.
- **E5-S4-AC2** — *Given* the seed, *then* application 4 has a loan `PENDING_DISBURSAL` with a schedule, and loan 1 is `ACTIVE` with `disbursed_on` 2026-01-15.
- **E5-S4-AC3** — *Given* ADMIN on 1280×800, *when* they open the dashboard, *then* KPI tiles (total overdue, NPA count, active loans), a bar chart by product and a bucket chart render from the API; at 375×812 they stack in one column.
- **E5-S4-AC4** — *Given* the applications table, *when* ADMIN sets status `REJECTED` and product `PERSONAL`, *then* only application 5 shows, the URL query reflects both filters, and no full page reload occurs.

## AC-tagged test list

| Test | Level | Tags |
|---|---|---|
| `api/test_application_list.py::test_AC10_filter_by_status` | API | AC-10 · E5-S1-AC1 |
| `api/test_application_list.py::test_AC10_filter_by_product_and_both` | API | AC-10 · E5-S1-AC2 |
| `api/test_application_list.py::test_AC10_pagination` | API | AC-10 · E5-S1-AC3 |
| `api/test_application_list.py::test_D03_underwriter_queue_manual_review` | API | D-03 · E5-S1-AC4 |
| `api/test_application_list.py::test_AC10_customer_sees_only_own` | API | AC-10, NFR-04 · E5-S1-AC5 |
| `api/test_dashboard.py::test_D07_by_product_counts_and_overdue` | API | D-07 · E5-S2-AC1 |
| `api/test_dashboard.py::test_D07_total_overdue_and_buckets` | API | D-07 · E5-S2-AC2 |
| `api/test_dashboard.py::test_D07_npa_at_125_days` | API | D-07 · E5-S2-AC3 |
| `api/test_dashboard.py::test_D07_empty_portfolio_zeros` | API | D-07 · E5-S2-AC4 |
| `api/test_dashboard.py::test_D07_admin_only_and_valid_date` | API | D-07, NFR-04 · E5-S2-AC5 |
| `api/test_tracking.py::test_D01_submitted_application_view` | API | D-01 · E5-S3-AC1 |
| `api/test_tracking.py::test_D01_rejected_shows_score_reasons_messages` | API | D-01 · E5-S3-AC2 |
| `api/test_tracking.py::test_D01_missing_documents_listed` | API | D-01 · E5-S3-AC3 |
| `api/test_tracking.py::test_D01_loan_link_and_ownership` | API | D-01, NFR-04 · E5-S3-AC4 |
| `e2e/track.spec.ts::D01 stepper and reasons on mobile` | Playwright | D-01 · E5-S3-AC5 |
| `repo/test_seed.py::test_AC10_demo_seed_is_idempotent` | Integration | AC-10 · E5-S4-AC1 |
| `repo/test_seed.py::test_AC10_seed_creates_real_loans` | Integration | AC-10, AC-07 · E5-S4-AC2 |
| `e2e/dashboard.spec.ts::D07 tiles and charts desktop and mobile` | Playwright | D-07 · E5-S4-AC3 |
| `e2e/applications.spec.ts::AC10 filters update results and URL` | Playwright | AC-10 · E5-S4-AC4 |

## Out of scope for F5

Exporting reports; time-series trends; editing applications from the list; notifications.
