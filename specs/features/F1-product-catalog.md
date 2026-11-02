# F1 — Product Catalog and Policy Versions

- **Feature / epic:** F1 / E1 · **Sprint:** 1 · **Parent:** `specs/app_spec.md`
- **Covers:** AC-01; D-06; NFR-02 and NFR-05 (policy side); NFR-08 (policy-immutability test); NFR-01 (rates and thresholds as decimal strings)
- **Depends on:** F0 — `{E0-S1, contract, auth guard}`, `{E0-S2, contract, audit writer}`, `{E0-S4, behavior, migrations runner}`
- Conventions (money format, errors, pagination, roles) are in `F0-platform.md`.

## Settled assumptions

| ID | Settles | Assumption |
|----|---------|------------|
| FA-F1.1 | Policy contents | Values below are synthetic. Income is **monthly gross INR**. Scale and rules for scoring are in F3. |
| FA-F1.2 | NFR-02 lifecycle | A policy version is `DRAFT` or `APPROVED`. Creating a version writes its file at once; the file never changes afterwards. `DRAFT → APPROVED` is the only status change, recorded in the DB (`approved_by`, `approved_at`) — it never touches the file or its hash. There is no edit, no delete and no un-approve; a change means a new version. |
| FA-F1.3 | Approval | Any `POLICY_EDITOR` or `ADMIN` may create a version; only an `ADMIN` approves. |
| FA-F1.4 | AC-04 | The **active** policy is the highest-numbered `APPROVED` version. It is pinned to an application at submission (F2). |
| FA-F1.5 | NFR-05 | A "policy migration" is the addition of a new version file `backend/policies/policy_v000N.json`. On startup every version's file hash must match `policy_versions.sha256`, otherwise startup aborts. |
| FA-F1.6 | Validation | Rate is 0.01–36.00 % p.a.; `min_age < max_age`; `min_tenure_months ≤ max_tenure_months`; `min_amount ≤ max_amount`; `auto_reject_below_score < auto_approve_min_score`; all within 300–900. |
| FA-F1.7 | Seed | Startup seeds user data (F0) and policy version 1 as `APPROVED` by user 1. |
| FA-F1.8 | Reason codes | The vocabulary lives in the policy file (`reason_codes` with a customer-readable message, `override_reason_codes`). |

### Policy version 1 (seed)

| Field | PERSONAL | VEHICLE | EDUCATION |
|---|---|---|---|
| min_age / max_age | 21 / 60 | 21 / 65 | 18 / 35 |
| min_income (monthly) | 25000.00 | 30000.00 | 20000.00 |
| tenure months (min–max) | 12–60 | 12–84 | 12–120 |
| amount (min–max) | 50000.00–1500000.00 | 100000.00–2500000.00 | 50000.00–2000000.00 |
| annual_rate_pct | 12.00 | 9.50 | 8.50 |
| auto_reject_below_score | 600 | 620 | 580 |
| auto_approve_min_score | 700 | 720 | 680 |
| required_documents | ID_PROOF, ADDRESS_PROOF, SALARY_SLIP | ID_PROOF, ADDRESS_PROOF, SALARY_SLIP, VEHICLE_QUOTATION | ID_PROOF, ADDRESS_PROOF, ADMISSION_LETTER, FEE_STRUCTURE |

Global: `reason_codes` = `INCOME_BELOW_MIN`, `AGE_OUT_OF_RANGE`, `SCORE_BELOW_MIN`, `SCORE_MEETS_AUTO_APPROVE`, `SCORE_IN_REVIEW_BAND`; `override_reason_codes` = `COMPENSATING_FACTORS`, `DATA_CORRECTION`, `SENIOR_APPROVAL`.

## Entities

| Entity | Fields |
|---|---|
| `policy_versions` | version (PK), status, file_path, sha256, base_version?, created_by, created_at, approved_by?, approved_at? |
| policy file (JSON) | `version`, `products` (keyed `PERSONAL`/`VEHICLE`/`EDUCATION`, fields as in the table above), `reason_codes`, `override_reason_codes` |

A trigger on `policy_versions` aborts `DELETE` and any `UPDATE` other than the one `DRAFT → APPROVED` transition.

## Endpoints

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/api/products` | any role | products of the active version, each with `policy_version`, thresholds, `required_documents` |
| GET | `/api/policies` | POLICY_EDITOR, ADMIN | list of versions with status and hash |
| GET | `/api/policies/{version}` | POLICY_EDITOR, ADMIN | full content |
| POST | `/api/policies` | POLICY_EDITOR, ADMIN | `{base_version, changes:{PERSONAL:{min_income:"30000.00"}}}` → 201 new `DRAFT` |
| POST | `/api/policies/{version}/approve` | ADMIN | → 200 `APPROVED` |

No `PUT`, `PATCH` or `DELETE` route exists on `/api/policies*`.

## Stories

### E1-S1 — Product catalog from the active policy (layer: API)
Depends on: E0-S1 (contract: auth guard). Traces: AC-01.
- **E1-S1-AC1** — *Given* seeded policy version 1, *when* an authenticated user GETs `/api/products`, *then* exactly 3 products return — `PERSONAL`, `VEHICLE`, `EDUCATION` — each with `policy_version` 1.
- **E1-S1-AC2** — *Given* version 1, *when* the rule sets are compared pairwise, *then* each differs in at least one threshold (`min_income` is `25000.00`, `30000.00`, `20000.00`).
- **E1-S1-AC3** — *Given* version 1, *when* the catalog is read, *then* `required_documents` has 3 entries for PERSONAL and 4 each for VEHICLE and EDUCATION.
- **E1-S1-AC4** — *Given* no token, *when* GET `/api/products`, *then* 401.
- **E1-S1-AC5** — *Given* `policy_v0001.json` edited on disk, *when* the app starts, *then* startup aborts with `POLICY_CHECKSUM_MISMATCH`.

### E1-S2 — Create and approve policy versions (layer: Service)
Depends on: E1-S1 (data: version 1), E0-S2 (contract: audit writer). Traces: D-06, NFR-02, NFR-05, NFR-08.
- **E1-S2-AC1** — *Given* POLICY_EDITOR user 2, *when* they POST `/api/policies` with `base_version` 1 and `PERSONAL.min_income` `"30000.00"`, *then* it is 201 with version 2, status `DRAFT`, file `policy_v0002.json` written, an audit row `POLICY_CREATED`, and the SHA-256 of `policy_v0001.json` unchanged.
- **E1-S2-AC2** — *Given* version 2 is `DRAFT`, *when* GET `/api/products`, *then* PERSONAL `min_income` is still `25000.00` and `policy_version` is 1.
- **E1-S2-AC3** — *Given* ADMIN user 1, *when* they POST `/api/policies/2/approve`, *then* it is 200 `APPROVED` with `approved_by` 1, an audit row `POLICY_APPROVED`, and GET `/api/products` shows PERSONAL `min_income` `30000.00` with `policy_version` 2.
- **E1-S2-AC4** — *Given* approved version 1, *when* PUT, PATCH or DELETE hits `/api/policies/1`, *then* it is 405; *when* SQL `UPDATE` changes its thresholds, *then* the database aborts.
- **E1-S2-AC5** — *Given* POLICY_EDITOR user 2, *when* they POST `/api/policies/2/approve`, *then* it is 403.
- **E1-S2-AC6** — *Given* a change setting `auto_reject_below_score` 750 with `auto_approve_min_score` 700, or `min_income` `"-1"`, *when* POSTed, *then* it is 422 `VALIDATION_ERROR` naming the offending field and no file is written.

### E1-S3 — Policy editor and catalog UI (layer: UI)
Depends on: E1-S2 (contract: policy endpoints). Traces: D-06; consumer-facing design bar.
- **E1-S3-AC1** — *Given* a POLICY_EDITOR on a 375×812 viewport, *when* they open the policy editor, *then* the product forms stack in one column with no horizontal scroll.
- **E1-S3-AC2** — *Given* the PERSONAL form, *when* they enter `min_age` 70 with `max_age` 60, *then* an inline error appears before submit and the Save button is disabled.
- **E1-S3-AC3** — *Given* valid changes, *when* they Save, *then* the page shows "Draft v2" and the new version appears in the list.

## AC-tagged test list

| Test | Level | Tags |
|---|---|---|
| `api/test_products.py::test_AC01_catalog_has_three_products` | API | AC-01 · E1-S1-AC1 |
| `unit/test_policy.py::test_AC01_rule_sets_pairwise_distinct` | Unit | AC-01 · E1-S1-AC2 |
| `unit/test_policy.py::test_AC01_required_documents_per_product` | Unit | AC-01 · E1-S1-AC3 |
| `api/test_products.py::test_AC01_requires_authentication` | API | AC-01 · E1-S1-AC4 |
| `repo/test_policy_files.py::test_NFR05_policy_hash_mismatch_aborts_startup` | Integration | NFR-05 · E1-S1-AC5 |
| `api/test_policies.py::test_D06_create_version_writes_new_file` | API | D-06, NFR-02 · E1-S2-AC1 |
| `api/test_policies.py::test_D06_draft_does_not_change_catalog` | API | D-06 · E1-S2-AC2 |
| `api/test_policies.py::test_D06_approve_activates_version` | API | D-06 · E1-S2-AC3 |
| `architecture/test_policy_immutable.py::test_NFR08_approved_policy_cannot_be_mutated` | Architecture | NFR-02, NFR-08 · E1-S2-AC4 |
| `api/test_policies.py::test_D06_editor_cannot_approve` | API | D-06 · E1-S2-AC5 |
| `unit/test_policy.py::test_D06_invalid_thresholds_rejected` | Unit | D-06 · E1-S2-AC6 |
| `e2e/policy-editor.spec.ts::D06 mobile layout has no horizontal scroll` | Playwright | D-06 · E1-S3-AC1 |
| `ui/PolicyForm.test.tsx::D06 inline age error disables save` | Vitest | D-06 · E1-S3-AC2 |
| `e2e/policy-editor.spec.ts::D06 save shows draft version` | Playwright | D-06 · E1-S3-AC3 |

## Out of scope for F1

Adding a fourth product type; editing score weights (the stub is fixed in code, see F3); rolling back an approved version (a newer version supersedes it).
