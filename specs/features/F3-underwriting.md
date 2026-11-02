# F3 — Scoring, Underwriting and Override

- **Feature / epic:** F3 / E3 · **Sprint:** 1 · **Parent:** `specs/app_spec.md`
- **Covers:** AC-03, AC-04, AC-05, AC-10 (override half); D-04, D-05; NFR-04 (decisions and overrides audited), NFR-08 (rule-engine tests)
- **Depends on:** F0 — `{E0-S2, contract, audit writer}`; F1 — `{E1-S2, data, active policy version and reason codes}`; F2 — `{E2-S2, data, submitted application with pinned policy_version}`
- Shared conventions are in `F0-platform.md`; policy v1 values are in `F1-product-catalog.md`.

## Settled assumptions

| ID | Settles | Assumption |
|----|---------|------------|
| FA-F3.1 | AC-03 flags | Credit-history flags are `prior_default`, `missed_payment_12m`, `thin_file` (booleans, supplied by the applicant record). |
| FA-F3.2 | AC-03 formula | Score = 600 + age points + income points − flag penalties. Age points by `age_years`: 18–25 → 0, 26–35 → 20, 36–50 → 40, 51–65 → 30, otherwise 0. Income points = `min(150, floor(monthly_income / 10000) × 10)`. Penalties: `prior_default` 150, `missed_payment_12m` 60, `thin_file` 40. The result is an integer between 350 and 790, inside the 300–900 reporting scale; no clamping is needed. The formula is fixed in code (not policy-editable). |
| FA-F3.3 | AC-04 rules | The rule engine uses the application's **pinned** policy version (F2). In order: (1) `monthly_income < min_income` raises `PolicyViolationException` (see AC-05). (2) `age_years` outside `[min_age, max_age]` adds `AGE_OUT_OF_RANGE`. (3) score `< auto_reject_below_score` adds `SCORE_BELOW_MIN`. If (2) or (3) added a code → `AUTO_REJECT` carrying all added codes. Otherwise score `≥ auto_approve_min_score` → `AUTO_APPROVE` with `SCORE_MEETS_AUTO_APPROVE`; otherwise `MANUAL_REVIEW` with `SCORE_IN_REVIEW_BAND`. |
| FA-F3.4 | AC-05 | `PolicyViolationException` is raised by the rule engine (code `INCOME_BELOW_MIN`). The underwriting service catches it and persists a decision `AUTO_REJECT` with reason code `INCOME_BELOW_MIN`; the API returns 200 with that decision, not an error. Income equal to the minimum does not violate. |
| FA-F3.5 | Trigger | Underwriting runs when `POST /api/applications/{id}/underwrite` is called on a `SUBMITTED` application. It is allowed once (a repeat returns 409). |
| FA-F3.6 | Status map | `AUTO_APPROVE` → `APPROVED`; `AUTO_REJECT` → `REJECTED`; `MANUAL_REVIEW` → `MANUAL_REVIEW`. Automated decisions are not audited (not underwriter actions). |
| FA-F3.7 | D-04 | Underwriter review outcome `APPROVE` → `APPROVED`, `REJECT` → `REJECTED`; the `reason` is free text, 1–500 characters. Only `UNDERWRITER` may review. |
| FA-F3.8 | AC-10 / D-05 | An override applies only to an `AUTO_REJECT` decision that has no resolution yet, and sets the status `APPROVED`. The original decision row is unchanged. `reason_code` must be one of the policy's `override_reason_codes`; `comment` is 1–500 characters. Both `UNDERWRITER` and `ADMIN` may override. |
| FA-F3.9 | Audit content | Each audit row for review or override stores actor, role, action, entity, `reason_code` (override only), `comment`/reason, and `before`/`after` status. |
| FA-F3.10 | Seam to F4 | After any transition to `APPROVED` (automated, review or override), F3 publishes an in-process `ApplicationApproved(application_id)` event in the same transaction. Sprint 1 has no subscriber; F4 registers schedule generation. |

## Entities

| Entity | Fields |
|---|---|
| `decisions` | id, application_id (unique), decision (`AUTO_APPROVE`/`AUTO_REJECT`/`MANUAL_REVIEW`), score, reason_codes (JSON array), policy_version, decided_at |
| `resolutions` | id, application_id (unique), kind (`MANUAL_REVIEW`/`OVERRIDE`), outcome (`APPROVED`/`REJECTED`), reason_code?, comment, resolved_by, resolved_at |

Both tables are insert-only; `applications.status` is the only mutable state.

## Endpoints

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/applications/{id}/underwrite` | owner, UNDERWRITER, ADMIN | → `{decision, score, reason_codes, policy_version, status}` |
| POST | `/api/applications/{id}/review` | UNDERWRITER | `{outcome:"APPROVE"\|"REJECT", reason}` |
| POST | `/api/applications/{id}/override` | UNDERWRITER, ADMIN | `{reason_code, comment}` |

## Stories

### E3-S1 — Credit-scoring stub (layer: Service)
Depends on: none (pure function). Traces: AC-03.
- **E3-S1-AC1** — *Given* age 40, income `"100000.00"`, no flags, *when* scored, *then* the score is 740.
- **E3-S1-AC2** — *Given* age 30, income `"60000.00"`, no flags, *then* 680; *given* age 30, income `"30000.00"`, `prior_default` true, *then* 500.
- **E3-S1-AC3** — *Given* the same inputs, *when* scored 100 times, *then* all 100 scores are identical.
- **E3-S1-AC4** — *Given* the 680 baseline, *when* one input changes, *then* age 40 gives 700, income `"70000.00"` gives 690, `missed_payment_12m` gives 620, `thin_file` gives 640 and `prior_default` gives 530.
- **E3-S1-AC5** — *Given* age 18, income `"0.00"` and all three flags, *then* 350; *given* age 40 with income `"150000.00"` or `"500000.00"`, *then* 790 in both cases.

### E3-S2 — Underwriting decision with reason codes (layer: Service)
Depends on: E3-S1 (contract: score function), E2-S2 (data: submitted application). Traces: AC-04.
- **E3-S2-AC1** — *Given* a submitted PERSONAL application (age 40, income `"100000.00"`, no flags, pinned version 1), *when* underwritten, *then* `decision` `AUTO_APPROVE`, `score` 740, `reason_codes` `["SCORE_MEETS_AUTO_APPROVE"]`, `policy_version` 1, status `APPROVED`, and one `ApplicationApproved` event is published.
- **E3-S2-AC2** — *Given* age 30, income `"60000.00"`, no flags (score 680, band 600–699), *then* `MANUAL_REVIEW` with `["SCORE_IN_REVIEW_BAND"]` and status `MANUAL_REVIEW`.
- **E3-S2-AC3** — *Given* age 30, income `"30000.00"`, `prior_default` (score 500), *then* `AUTO_REJECT` with `["SCORE_BELOW_MIN"]` and status `REJECTED`.
- **E3-S2-AC4** — *Given* age 70, income `"100000.00"` (score 700), *then* `AUTO_REJECT` with `["AGE_OUT_OF_RANGE"]` only.
- **E3-S2-AC5** — *Given* application A submitted under version 1 and version 2 (PERSONAL `min_income` `"30000.00"`) approved afterwards, and application B submitted after that, both age 30 with income `"26000.00"`, *when* underwritten, *then* A uses `policy_version` 1 and is `MANUAL_REVIEW` (score 640), while B uses `policy_version` 2 and is `AUTO_REJECT` with `["INCOME_BELOW_MIN"]`.
- **E3-S2-AC6** — *Given* a `DRAFT` application, *when* underwrite is called, *then* 409 `NOT_SUBMITTED`; *given* an already decided one, *then* 409 `ALREADY_DECIDED` and the stored decision is unchanged.

### E3-S3 — Minimum-income violation (layer: Service)
Depends on: E3-S2 (behavior: decision persistence). Traces: AC-05.
- **E3-S3-AC1** — *Given* PERSONAL with `min_income` `"25000.00"`, *when* the rule engine evaluates income `"24999.99"`, *then* it raises `PolicyViolationException` with code `INCOME_BELOW_MIN`.
- **E3-S3-AC2** — *Given* income exactly `"25000.00"` (age 30, no flags, score 640), *when* evaluated, *then* no exception is raised and the decision is `MANUAL_REVIEW`.
- **E3-S3-AC3** — *Given* a submitted application with income `"24999.99"`, *when* underwrite is called, *then* 200 with `AUTO_REJECT`, `reason_codes` `["INCOME_BELOW_MIN"]`, status `REJECTED`, and a persisted `decisions` row.

### E3-S4 — Manual review and override (layer: Service)
Depends on: E3-S2 (data: decisions), E0-S2 (contract: audit writer). Traces: D-04, D-05, AC-10, NFR-04.
- **E3-S4-AC1** — *Given* application 2 in `MANUAL_REVIEW`, *when* UNDERWRITER user 3 POSTs `{outcome:"APPROVE", reason:"Stable income, documents verified"}`, *then* 200 status `APPROVED`, resolution `MANUAL_REVIEW`/`APPROVED`, an audit row `REVIEW_APPROVED` with actor 3, and an `ApplicationApproved` event.
- **E3-S4-AC2** — *Given* the same state, *when* they POST `REJECT` with a reason, *then* status `REJECTED`, audit `REVIEW_REJECTED`, and no event.
- **E3-S4-AC3** — *Given* application 3 with decision `AUTO_REJECT`, *when* ADMIN user 1 POSTs `{reason_code:"COMPENSATING_FACTORS", comment:"Co-signed by parent; income verified"}`, *then* 200 status `APPROVED`, the decision row still reads `AUTO_REJECT`, an audit row `DECISION_OVERRIDDEN` with actor 1, the reason code, the comment and before `REJECTED`/after `APPROVED`, and an event.
- **E3-S4-AC4** — *Given* application 4 with `AUTO_REJECT`, *when* UNDERWRITER user 3 overrides with `DATA_CORRECTION`, *then* the same outcome with actor 3 in the audit row.
- **E3-S4-AC5** — *Given* an application in `MANUAL_REVIEW` or already overridden, *when* override is called, *then* 409 `NOT_OVERRIDABLE`; *given* `reason_code` `"FOO"` or an empty comment, *then* 422; *given* review on an application not in `MANUAL_REVIEW`, *then* 409 `NOT_IN_REVIEW`; *given* a CUSTOMER token, *then* 403.

### E3-S5 — Decision review and override UI (layer: UI)
Depends on: E3-S4 (contract: endpoints). Traces: D-04, D-05; consumer-facing design bar.
- **E3-S5-AC1** — *Given* an underwriter opening application 2, *when* the page loads, *then* it shows score 680, the reason code with its message and policy version 1; at 375×812 the panels stack with no horizontal scroll.
- **E3-S5-AC2** — *Given* the override dialog on an `AUTO_REJECT` application, *when* the comment is empty or no reason code is chosen, *then* Submit is disabled; with both set it enables and success shows a confirmation.
- **E3-S5-AC3** — *Given* a `MANUAL_REVIEW` application, *when* the reason field is empty, *then* Approve and Reject are disabled.

## AC-tagged test list

| Test | Level | Tags |
|---|---|---|
| `unit/test_scoring.py::test_AC03_known_scores` | Unit | AC-03 · E3-S1-AC1, AC2 |
| `unit/test_scoring.py::test_AC03_same_inputs_same_score` | Unit | AC-03 · E3-S1-AC3 |
| `unit/test_scoring.py::test_AC03_each_input_changes_score` | Unit | AC-03 · E3-S1-AC4 |
| `unit/test_scoring.py::test_AC03_score_bounds` | Unit | AC-03 · E3-S1-AC5 |
| `api/test_underwrite.py::test_AC04_auto_approve_with_reason_code` | API | AC-04 · E3-S2-AC1 |
| `api/test_underwrite.py::test_AC04_manual_review_band` | API | AC-04 · E3-S2-AC2 |
| `api/test_underwrite.py::test_AC04_auto_reject_low_score` | API | AC-04 · E3-S2-AC3 |
| `unit/test_rule_engine.py::test_AC04_age_out_of_range_rejects` | Unit | AC-04 · E3-S2-AC4 |
| `api/test_underwrite.py::test_AC04_pinned_policy_version_used` | API | AC-04 · E3-S2-AC5 |
| `api/test_underwrite.py::test_AC04_underwrite_once_and_only_when_submitted` | API | AC-04 · E3-S2-AC6 |
| `unit/test_rule_engine.py::test_AC05_below_min_income_raises` | Unit | AC-05 · E3-S3-AC1 |
| `unit/test_rule_engine.py::test_AC05_income_at_threshold_passes` | Unit | AC-05 · E3-S3-AC2 |
| `api/test_underwrite.py::test_AC05_violation_persisted_as_auto_reject` | API | AC-05 · E3-S3-AC3 |
| `api/test_review.py::test_D04_underwriter_approves_manual_review` | API | D-04, NFR-04 · E3-S4-AC1 |
| `api/test_review.py::test_D04_underwriter_rejects_manual_review` | API | D-04, NFR-04 · E3-S4-AC2 |
| `api/test_override.py::test_AC10_admin_override_audited` | API | AC-10, NFR-04 · E3-S4-AC3 |
| `api/test_override.py::test_D05_underwriter_override_audited` | API | D-05, NFR-04 · E3-S4-AC4 |
| `api/test_override.py::test_AC10_override_guards` | API | AC-10 · E3-S4-AC5 |
| `ui/DecisionPanel.test.tsx::D04 layout and reason display` | Vitest | D-04 · E3-S5-AC1 |
| `e2e/override.spec.ts::D05 override dialog validation` | Playwright | D-05 · E3-S5-AC2 |
| `ui/ReviewActions.test.tsx::D04 buttons need reason` | Vitest | D-04 · E3-S5-AC3 |

## Out of scope for F3

Real bureau data; tuning score weights through the policy editor; re-underwriting after a policy change; overriding anything other than an `AUTO_REJECT`.
