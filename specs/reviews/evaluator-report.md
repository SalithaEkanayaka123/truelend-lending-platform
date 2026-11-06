# Evaluator Report — Sprint 1 (groups A–G)

Date: 2026-11-06T17:35:00Z
Branch: `feat/sprint-1`
Mode: **Full** (`execution.default_mode`), `verification.mode: local`
VERDICT: **FAIL** — 2 contracted API checks fail (QA-VM-005, QA-VM-013) and the
security gate produced no verdict. Everything else passes.

## How the app was run

Sprint contracts were read-only; no product code was changed. Each group was
replayed against its **own freshly booted backend** with `TRUELEND_ENV=test`, a
scratch SQLite DB and a private copy of `policy_v0001.json`, so the contracts'
canonical ids (application 1, document 1, policy version 2) hold:

```
TRUELEND_ENV=test TRUELEND_DB_PATH=<scratch>/app.db TRUELEND_POLICIES_DIR=<scratch>/policies \
  uv run uvicorn truelend.api.main:create_app --factory --app-dir src --host 127.0.0.1 --port <p>
```

Extra instances were booted for the checks that need a different process state:
`TRUELEND_ENV` unset and `TRUELEND_ENV=production` (QA-VM-014-NT), a restart on
the same DB after editing `policy_v0001.json` (QA-VM-024), and a restart after
editing an applied migration (E1-S4-AC3). Health was polled (200 on `/health`)
before any check. Browser checks ran against the project's Playwright suite
(real chromium, real backend + Vite, no mocks); the accessibility audit ran
against Vite on `http://localhost:3000` proxying the backend on `:8000`.

Known suite results confirmed by re-running: backend `pytest` **193 passed**,
frontend `vitest` **250 passed** (48 files), e2e Playwright **93 passed** (exit 0).

## Per-group verdict

| Group | Stories | API checks | Browser checks | Accessibility | Verdict |
|---|---|---|---|---|---|
| A | E1-S1, E1-S3, E1-S4, E3-S2 | 13/15 | — | — | **FAIL** (QA-VM-005, QA-VM-013) |
| B | E1-S2, E2-S1 | 9/9 | — | — | PASS |
| C | E2-S2, E4-S1 | 11/11 (+QA-VM-069 re-run) | — | — | PASS |
| D | E2-S3, E4-S2 | 5/5 | 3/3 | 0 violations | PASS |
| E | E3-S1, E3-S3 | 11/11 | — | — | PASS |
| F | E2-S4, E3-S4, E3-S5 | 8/8 | 3/3 | 0 violations | PASS |
| G | E3-S6 | — | 3/3 | 0 violations | PASS |

Totals: **57/59 contracted API checks pass**, **9/9 Playwright checks pass**,
**3/3 accessibility blocks pass**, evidence-integrity gate passes for D, F and G.

## Layer 1 — API checks

### Group A (15 checks)

- [PASS] QA-VM-001 (`VM-001`) — `POST /api/auth/login` customer1 → 200, `expires_in=1800`, `role=CUSTOMER`.
- [PASS] QA-VM-002 (`VM-002`) — wrong password: known email 401, unknown email 401, `code=UNAUTHENTICATED`, bodies identical apart from `correlation_id`, no `access_token`.
- [PASS] QA-VM-003 (`VM-003`) — `GET /api/auth/me`: no header 401; token aged 1801 s 401; control (freshly minted token, same secret and claim shape) 200.
- [PASS] QA-VM-004 (`VM-004`) — `GET /api/audit` with CUSTOMER token → 403 `FORBIDDEN`.
- [**FAIL**] QA-VM-005 (`VM-005`) — see Failure 1 below. The AC clause passes; the contract's "requires ADMIN" clause does not.
- [PASS] QA-VM-012 (`VM-012`) — create with PAN `ABCDE1234F` / Aadhaar `123456789012` → 201, error path (tenure 72) → 422; captured logs contain none of `ABCDE1234F`, `123456789012`, `1234 5678 9012`.
- [**FAIL**] QA-VM-013 (`VM-013`) — see Failure 2 below. Filename absent from logs (correct); document id absent too (not correct).
- [PASS] QA-VM-014 (`VM-014`) — `GET /api/_test/boom` as ADMIN with `TRUELEND_ENV=test` → 500 `INTERNAL_ERROR`, no stack trace in the body, one JSON log line carrying the trace under the same `correlation_id`.
- [PASS] QA-VM-014-NT (`VM-014`) — same request with `TRUELEND_ENV` unset → 404 `NOT_FOUND`, and with `TRUELEND_ENV=production` → 404 `NOT_FOUND`. (Two instances: one server cannot satisfy this row and QA-VM-014 at once.)
- [PASS] QA-VM-015 (`VM-015`) — `GET /health` with no token → 200 `{"status":"ok"}` in 1 ms.
- [PASS] QA-VM-043 (`VM-043`) — age 40 / 100000.00 / no flags → score **740**.
- [PASS] QA-VM-044 (`VM-044`) — age 30 / 60000.00 → **680**; age 30 / 30000.00 / prior_default → **500**.
- [PASS] QA-VM-045 (`VM-045`) — 100 fresh applications, identical inputs → exactly one distinct score `[680]`.
- [PASS] QA-VM-046 (`VM-046`) — from the 680 baseline: age 40 → **700**, income 70000.00 → **690**, missed_payment_12m → **620**, thin_file → **640**, prior_default → **530**.
- [PASS] QA-VM-047 (`VM-047`) — age 18 / 0.00 / all flags → **350**; age 40 / 150000.00 → **790**; age 40 / 500000.00 → **790**.

### Group B (9 checks)

- [PASS] QA-VM-006 (`VM-006`) — UNDERWRITER user 3 performs an audited action on application 7 (through the app's own audit path, `POST /api/_test/audited-action`): audit row `actor_user_id=3`, `actor_role=UNDERWRITER`, `entity application/7`, `occurred_at` UTC (`+00:00`), `correlation_id` equal to the response `X-Correlation-ID`.
- [PASS] QA-VM-007 (`VM-007`) — `GET /api/audit` as ADMIN → 200; raw `UPDATE` aborts ("audit_log is append-only: update forbidden"), raw `DELETE` aborts ("…delete forbidden"), 5 rows byte-identical before and after.
- [PASS] QA-VM-008 (`VM-008`) — given 3 audited actions on application 7 and 2 on application 8, `GET /api/audit?entity_type=application&entity_id=7` → 200 with exactly 3 rows, ascending by id, none from application 8.
- [PASS] QA-VM-009 (`VM-009`) — an audited action that fails with 409 leaves **no** audit row (0 before, 0 after); the audit write shares the action's transaction.
- [PASS] QA-VM-020 (`VM-020`) — `GET /api/products` authenticated → 200, 3 products (PERSONAL/VEHICLE/EDUCATION), all `policy_version=1`.
- [PASS] QA-VM-021 (`VM-021`) — `min_income` `25000.00 / 30000.00 / 20000.00`; all three rule sets differ pairwise.
- [PASS] QA-VM-022 (`VM-022`) — `required_documents` counts `{PERSONAL:3, VEHICLE:4, EDUCATION:4}`.
- [PASS] QA-VM-023 (`VM-023`) — `GET /api/products` with no token → 401 `UNAUTHENTICATED`.
- [PASS] QA-VM-024 (`VM-024`) — clean start `/health` 200; after editing `policy_v0001.json` and restarting on the same DB the process exits 3 with `PolicyChecksumMismatchError` (code `POLICY_CHECKSUM_MISMATCH`, asserted by `backend/tests/unit/test_policy_service.py:127`) and `/health` never returns 200.

### Group C (11 checks; QA-VM-069 run before and after approval)

- [PASS] QA-VM-025 (`VM-025`) — AC payload as customer 4 → 201, `id=1`, `DRAFT`, `applicant_user_id=4`.
- [PASS] QA-VM-026 (`VM-026`) — PERSONAL checklist `[ID_PROOF, ADDRESS_PROOF, SALARY_SLIP]` all `MISSING`; VEHICLE 4 incl. `VEHICLE_QUOTATION`; EDUCATION 4 incl. `ADMISSION_LETTER` + `FEE_STRUCTURE`.
- [PASS] QA-VM-027 (`VM-027`) — tenure 72 → 422 `TENURE_OUT_OF_RANGE`; amount 10000.00 → 422 `AMOUNT_OUT_OF_RANGE`.
- [PASS] QA-VM-028 (`VM-028`) — PAN `abc` → 422 `VALIDATION_ERROR`; 11-digit Aadhaar → 422 `VALIDATION_ERROR`; valid → `pan_masked=******234F`, `aadhaar_masked=********9012`, raw values absent from the body.
- [PASS] QA-VM-029 (`VM-029`) — `GET /api/applications/1` as customer 5 → 404 `NOT_FOUND`.
- [PASS] QA-VM-065 (`VM-065`) — `POST /api/policies` (base 1, PERSONAL.min_income 30000.00) as user 2 → 201 v2 `DRAFT`, `policy_v0002.json` written, audit `POLICY_CREATED`, SHA-256 of `policy_v0001.json` unchanged.
- [PASS] QA-VM-066 (`VM-066`) — while v2 is DRAFT, `GET /api/products` → PERSONAL `min_income=25000.00`, `policy_version=1`.
- [PASS] QA-VM-067 (`VM-067`) — approve as ADMIN → 200 `APPROVED`, `approved_by=1`, audit `POLICY_APPROVED`; `GET /api/products` → `30000.00`, `policy_version=2`.
- [PASS] QA-VM-068 (`VM-068`) — `PUT/PATCH/DELETE /api/policies/1` → 405/405/405; raw SQL `UPDATE` of approved v1 aborts ("policy_versions only allows the DRAFT->APPROVED transition"); rows unchanged.
- [PASS] QA-VM-069 (`VM-069`) — approve v2 as POLICY_EDITOR user 2 → 403 `FORBIDDEN`, both before approval and after (authorization is checked ahead of state).
- [PASS] QA-VM-070 (`VM-070`) — `auto_reject_below_score 750` against `auto_approve_min_score 700` → 422 naming `PERSONAL.auto_reject_below_score: must be less than auto_approve_min_score`; `min_income "-1"` → 422 naming `PERSONAL.min_income: must not be negative`; policy dir still only `v0001`/`v0002`.

### Group D (5 checks)

- [PASS] QA-VM-030 (`VM-030`) — `{ID_PROOF, id_front.png}` → 201, checklist entry `UPLOADED` with that filename; `application_documents` columns are `id, application_id, type, status, filename, reason, uploaded_at, verified_by, verified_at` — no content/blob column, so no file bytes are stored.
- [PASS] QA-VM-031 (`VM-031`) — `VEHICLE_QUOTATION` on a PERSONAL application → 422 `DOCUMENT_TYPE_NOT_REQUIRED`.
- [PASS] QA-VM-032 (`VM-032`) — submit with `SALARY_SLIP` missing → 409 `MISSING_DOCUMENTS`, `missing: ["SALARY_SLIP"]`, status stays `DRAFT`.
- [PASS] QA-VM-033 (`VM-033`) — submit with all 3 uploaded → 200 `SUBMITTED`, `policy_version=1`, `submitted_at` set.
- [PASS] QA-VM-034 (`VM-034`) — submit again → 409 `ALREADY_SUBMITTED`.

### Group E (11 checks)

- [PASS] QA-VM-038 (`VM-038`) — queue as user 3 → 200, 3 items oldest-first, each with `document_id`, `application_id=1`, `type`.
- [PASS] QA-VM-039 (`VM-039`) — verify document 1 → 200 `VERIFIED`, `verified_by=3`, audit `DOCUMENT_VERIFIED`, item left the queue.
- [PASS] QA-VM-040 (`VM-040`) — reject document 2 → 200 `REJECTED` with the reason, audit `DOCUMENT_REJECTED`, application still `SUBMITTED`.
- [PASS] QA-VM-041 (`VM-041`) — reason missing / empty / 501 chars → 422 `VALIDATION_ERROR` each; no audit row for document 3.
- [PASS] QA-VM-042 (`VM-042`) — CUSTOMER queue → 403; CUSTOMER verify → 403; re-verify a VERIFIED document → 409 `ALREADY_VERIFIED`.
- [PASS] QA-VM-048 (`VM-048`) — `AUTO_APPROVE`, score 740, `[SCORE_MEETS_AUTO_APPROVE]`, policy v1, status `APPROVED`, exactly **one** `ApplicationApproved` event for that application.
- [PASS] QA-VM-049 (`VM-049`) — `MANUAL_REVIEW`, 680, `[SCORE_IN_REVIEW_BAND]`, status `MANUAL_REVIEW`.
- [PASS] QA-VM-050 (`VM-050`) — `AUTO_REJECT`, 500, `[SCORE_BELOW_MIN]`, status `REJECTED`.
- [PASS] QA-VM-051 (`VM-051`) — age 70 → `AUTO_REJECT`, score 700, `reason_codes` exactly `[AGE_OUT_OF_RANGE]`.
- [PASS] QA-VM-052 (`VM-052`) — A submitted under v1 then v2 approved then B submitted: A → `policy_version=1`, `MANUAL_REVIEW`, score 640; B → `policy_version=2`, `AUTO_REJECT`, `[INCOME_BELOW_MIN]`.
- [PASS] QA-VM-053 (`VM-053`) — DRAFT → 409 `NOT_SUBMITTED`; already decided → 409 `ALREADY_DECIDED` with the stored decision byte-identical before and after.

### Group F (8 checks)

- [PASS] QA-VM-054 (`VM-054`) — income 24999.99 against `min_income 25000.00` → 200 with `INCOME_BELOW_MIN` surfaced as the reason code.
- [PASS] QA-VM-055 (`VM-055`) — income exactly 25000.00, age 30 → score 640, `MANUAL_REVIEW`, no policy-violation code.
- [PASS] QA-VM-056 (`VM-056`) — income 24999.99 → `AUTO_REJECT`, `[INCOME_BELOW_MIN]`, `REJECTED`, one persisted `decisions` row, `GET …/decision` → 200.
- [PASS] QA-VM-057 (`VM-057`) — review APPROVE as user 3 → 200 `APPROVED`, resolution `MANUAL_REVIEW/APPROVED` resolved_by 3, audit `REVIEW_APPROVED` actor 3, one `ApplicationApproved` event.
- [PASS] QA-VM-058 (`VM-058`) — review REJECT → 200 `REJECTED`, audit `REVIEW_REJECTED`, **zero** `ApplicationApproved` events.
- [PASS] QA-VM-059 (`VM-059`) — override as ADMIN user 1 (`COMPENSATING_FACTORS`) → 200 `APPROVED`, stored decision still `AUTO_REJECT`, audit `DECISION_OVERRIDDEN` actor 1 with reason code, comment, before `REJECTED` / after `APPROVED`, one event.
- [PASS] QA-VM-060 (`VM-060`) — same via UNDERWRITER user 3 (`DATA_CORRECTION`), actor 3 in the audit row.
- [PASS] QA-VM-061 (`VM-061`) — override on `MANUAL_REVIEW` → 409 `NOT_OVERRIDABLE`; override already overridden → 409 `NOT_OVERRIDABLE`; `reason_code FOO` → 422; empty comment → 422; review on a non-`MANUAL_REVIEW` application → 409 `NOT_IN_REVIEW`; CUSTOMER override → 403; CUSTOMER review → 403.

## Layer 2 — Playwright checks

All nine contracted browser checks executed in a real chromium against the real
backend and Vite (`e2e/playwright.config.ts`), with semantic locators
(`getByRole` / `getByLabel` / `getByText`) and visibility/enabled assertions —
no `waitForTimeout`, no CSS selectors. Full run: `specs/reviews/evaluator-e2e-results.txt`.

- [PASS] QA-VM-071 (`VM-071`) — policy editor at 375×812: product forms stack in one column, `scrollWidth <= clientWidth` (`e2e/policy-editor.spec.ts:15`).
- [PASS] QA-VM-072 (`VM-072`) — Min age 70 / Max age 60: inline error visible, Save disabled (`policy-editor.spec.ts:36`).
- [PASS] QA-VM-073 (`VM-073`) — valid change saved: "Draft v2" shown and v2 in the list (`policy-editor.spec.ts:46`).
- [PASS] QA-VM-035 (`VM-035`) — apply wizard at 375×812: "Step 1 of 3" progress, one step at a time, no horizontal scroll (`e2e/apply.spec.ts:20`).
- [PASS] QA-VM-036 (`VM-036`) — tenure 72 for PERSONAL: inline `12-60 months` alert before Continue, Continue disabled (`apply.spec.ts:40`).
- [PASS] QA-VM-037 (`VM-037`) — queue table at 1280×800, stacked cards at 375×812, verify via dialog removes the row with no navigation (URL unchanged) (`e2e/verification.spec.ts:35`).
- [PASS] QA-VM-062 (`VM-062`) — decision panel shows score 680, reason code + message, policy v1; panels stack at 375×812 (`e2e/decision.spec.ts:62`).
- [PASS] QA-VM-063 (`VM-063`) — override dialog: Submit disabled until both reason code and comment set, then confirmation (`decision.spec.ts:88`).
- [PASS] QA-VM-064 (`VM-064`) — manual review Approve/Reject disabled while the reason is empty, at 375/768/1280 (`decision.spec.ts:112`).

### Accessibility (axe-core 4.14.0) — contracts D, F, G, `required: true`

20 page states audited (sign-in, each role's landing, `/policies`, `/apply`,
`/applications`, `/verification`) × 1280×800 and 375×812. Result: **0 violations
at any impact**, so zero in `block_impacts [serious, critical]`. Audit proven
live (`axe.run()` on the rendered Policy editor: 35 passing rules, 55
inapplicable, 0 violations). Full output: `specs/reviews/evaluator-axe.json`.

- [WARN] One `incomplete` result, `color-contrast` (serious), where axe could not
  compute contrast. `incomplete` is not a violation and does not gate; a human
  contrast check on the policy-editor surface is advisable.

### Evidence integrity (G39)

`node .claude/scripts/evidence-integrity-gate.js --group {D,F,G}` → exit 0 each:
"3 browser check(s) backed by user-path interaction", 0 findings, 0 untested.
Ledgers: `specs/reviews/evaluator-evidence.json` (consolidated, 12 entries) and
the per-group scoped copies `evaluator-evidence-{D,F,G}.json`, which are what
the gate consumed (the gate is per group; a consolidated ledger reads as
`undeclared-check` against any single contract). Verdicts:
`evidence-integrity-verdict-{D,F,G}.json`.

## Layer 3 — Design checks

- [SKIP] No contract in `sprint-contracts/A..G.json` declares a `design_checks`
  block, so there is nothing for the design-critic to score and no
  `eval-scores.json` is produced. This is a contract gap, not a pass: the UI
  stories (E2-S4, E3-S6, E4-S2) carry only `playwright_checks`.

## Architecture checks

- [N/A] No contract declares `architecture_checks.files_must_exist`.
- [PASS] Covered instead by the repo's own architecture tests, re-run here:
  `tests/architecture/test_layers.py` (E1-S4-AC4, one-way layering) and
  `tests/architecture/test_money.py` (E1-S4-AC5, no float money) — 14 passed
  together with `tests/repo/test_migrations.py`.

## Layer 4 — Security gate

- [**FAIL**] `specs/reviews/security-verdict.json` does not exist. Per the
  evaluate skill a missing scan is never a pass: `failure_layer: "security"`,
  reason "security-reviewer did not produce a verdict". The `security-reviewer`
  agent could not be spawned from this evaluation run and must be run by
  `/gate` before merge.
- Two findings this evaluation surfaced that the security review should judge
  (both confined to `TRUELEND_ENV=test` builds, so not production exposure):
  any authenticated principal can trigger the unhandled 500 at
  `/api/_test/boom`, and any authenticated principal — including CUSTOMER —
  can write an arbitrary `audit_log` row via `POST /api/_test/audited-action`
  (observed 200 with a CUSTOMER token).

## Performance

Ratchet state: no `specs/reviews/perf-baseline.json` existed, so this run
**established** the baseline — WARN, not FAIL; the ratchet is active from the
next evaluation.

- [WARN] Baseline captured (`node .claude/scripts/perf-baseline.js --endpoints "/health,/openapi.json"`): `/health` p95 **2.96 ms**, `/openapi.json` p95 **3.22 ms** (20 samples each).
- [PASS] Authenticated reads, 20 samples each, all far inside the 300 ms read budget: `/api/auth/me` p95 4.19 ms, `/api/products` 5.06 ms, `/api/audit` 4.58 ms, `/api/policies` 4.88 ms, `/api/applications/1` 6.00 ms, `/api/applications/1/decision` 7.22 ms, `/api/verification-queue` 4.84 ms (`VM-001…VM-070` endpoints).
- [PASS] Writes, single-shot against the 800 ms budget: `POST /api/applications` 20.07 ms, 3× document upload 26.87 ms, submit 8.47 ms, underwrite 8.72 ms, login 170.81 ms (bcrypt-bound).
- No regression is possible on a first capture; nothing exceeded its budget.

## SLO sensor

- [WARN] `node .claude/scripts/slo-check.js` → `verdict: "unreachable"`:
  `project-manifest.json` sets `observability.enabled: true` with
  `metrics_path: /metrics`, but the app answers `/metrics` with 404
  `NOT_FOUND`, so error-rate and p95 could not be scraped. Per the skill an
  unreachable `/metrics` is a WARN, never a FAIL — and no story or acceptance
  criterion in Sprint 1 requires a metrics endpoint. Either implement
  `/metrics` or set `observability.enabled: false` until E-series work adds it.
  Verdict file: `specs/reviews/slo-verdict.json`.

## Verification-matrix coverage

67 of 73 matrix rows are referenced by a contract check, and every row whose
`required_layers` includes `api` or `e2e` is covered. The 6 unreferenced rows are
`unit`-layer only and were verified directly rather than assumed:

| Row | Criterion | Evidence |
|---|---|---|
| VM-010 | E1-S3-AC1 | runtime: one JSON line per request with exactly `ts, level, event, correlation_id, method, path, status, duration_ms` — PASS |
| VM-011 | E1-S3-AC2 | runtime: no header → UUID4 echoed and in the log; `req-12345678` reused verbatim; `a b!` replaced by a UUID4 — PASS |
| VM-016 | E1-S4-AC2 | runtime: restart on the same DB re-ran no migration, `schema_migrations` identical (6 rows, all SHA-256) — PASS |
| VM-017 | E1-S4-AC3 | runtime: edited `0002_policy_versions.sql` → exit 3 `MigrationChecksumMismatchError`, `/health` never 200 — PASS |
| VM-018 | E1-S4-AC4 | `tests/architecture/test_layers.py` — PASS |
| VM-019 | E1-S4-AC5 | `tests/architecture/test_money.py` — PASS |

Note: E1-S4-AC2's wording ("migrations 0001 through 0003 … still has 3 rows") is
stale — the tree now has 6 migrations and 6 rows. The invariant (none re-run,
every row checksummed) holds.

## Stories: 14 of 16 fully pass

| Story | Group | Verdict |
|---|---|---|
| E1-S1 Authn/authz | A | **FAIL** — AC1–AC4 pass; AC5/QA-VM-005 fails on the contract's ADMIN clause for `/api/_test/boom` |
| E1-S2 Audit trail | B | PASS (AC1–AC4) |
| E1-S3 Logging & redaction | A | **FAIL** — AC1, AC2, AC3, AC5 pass; AC4/QA-VM-013 fails (no document id in the logs) |
| E1-S4 Health, migrations, layering, money | A | PASS (AC1–AC5) |
| E2-S1 Product catalog | B | PASS |
| E2-S2 Application creation | C | PASS |
| E2-S3 Documents & submit | D | PASS |
| E2-S4 Apply + verification UI | F | PASS |
| E3-S1 Verification queue | E | PASS |
| E3-S2 Credit scoring | A | PASS |
| E3-S3 Underwriting decision | E | PASS |
| E3-S4 Policy rule engine | F | PASS |
| E3-S5 Review & override | F | PASS |
| E3-S6 Decision UI | G | PASS |
| E4-S1 Policy versioning | C | PASS |
| E4-S2 Policy editor UI | D | PASS |

## The two failures

### Failure 1 — QA-VM-005 / VM-005 / F005 (`specs/reviews/eval-failures-001.json`)

`GET /openapi.json` → 200, and the only schema routes without an `HTTPBearer`
requirement are `GET /health` and `POST /api/auth/login` — so **E1-S1-AC5's own
clause passes**. What fails is the contract's further clause that
`/api/_test/boom` "requires ADMIN": the route declares
`dependencies=[Depends(get_current_principal)]` (authentication only, no role),
so anonymous → 401 but **CUSTOMER → 500 and POLICY_EDITOR → 500**, same as
ADMIN. The hidden fixture `POST /api/_test/audited-action` is likewise
authenticated-only (CUSTOMER → 200). Both routes mount only when
`TRUELEND_ENV == "test"`. Resolution is a human call — add an ADMIN role
dependency to the two fixture routes, or correct the frozen contract text; the
evaluator does not edit sprint contracts.

### Failure 2 — QA-VM-013 / VM-013 / F013 (`specs/reviews/eval-failures-002.json`)

Upload of `salary_slip_jan.pdf` → 201 with `document_id` in the response. The
privacy half of E1-S3-AC4 holds: `salary_slip_jan` appears nowhere in the
captured logs. The observability half does not: no log line carries the document
id in any form (searched `"document_id": 6`, `"document_id":6`, `document_id=6`,
`"entity_id": 6`, `document/6`). The request line logs only
`…, "path": "/api/applications/5/documents", "status": 201, …` — the path carries
the *application* id. Fix is an added log field on the upload path, not a
redaction change.

## `group-a-contract-replay.md` replayed properly

The recorded replay used `local-regression-gate.js`, which sends **bare requests
(no body, no token) and compares only the status code**; it recorded 2 pass / 13
fail. Replayed with real bodies, real tokens and the process state each row
requires, **12 of those 13 now pass and 1 still fails** — and one row the bare
replay scored as a pass actually fails:

| Row | Bare replay | Proper replay | Still fails? |
|---|---|---|---|
| QA-VM-001 | 422 (no body) | 200, `expires_in 1800`, `role CUSTOMER` | no |
| QA-VM-002 | 422 (no body) | 401/401 `UNAUTHENTICATED`, identical bodies, no token | no |
| QA-VM-003 | 401 (no token) | 401 no header, 401 for a 1801 s-old token | no |
| QA-VM-004 | 404 (route absent) | 403 `FORBIDDEN` with a CUSTOMER token | no |
| QA-VM-005 | 200 — "pass" | **FAIL**: auth dependency correct, `/api/_test/boom` not ADMIN-gated | **yes (new)** |
| QA-VM-012 | 404 | 201 + 422 paths, no PII in logs | no |
| QA-VM-013 | 404 | **FAIL**: filename absent (good), document id absent (bad) | **yes** |
| QA-VM-014 | 401 (no token) | 500 with ADMIN token under `TRUELEND_ENV=test`, redacted trace logged | no |
| QA-VM-014-NT | 401 | 404 `NOT_FOUND` with `TRUELEND_ENV` unset and `=production` (second instance) | no |
| QA-VM-015 | 200 | 200 `{"status":"ok"}` in 1 ms | no |
| QA-VM-043 | 404 | score 740 | no |
| QA-VM-044 | 404 | 680 and 500 | no |
| QA-VM-045 | 404 | 100 runs, one distinct score | no |
| QA-VM-046 | 404 | 700 / 690 / 620 / 640 / 530 | no |
| QA-VM-047 | 404 | 350 / 790 / 790 | no |

Two structural points the replay doc raised are confirmed: QA-VM-014 and
QA-VM-014-NT cannot both be satisfied by one server (they need opposite
`TRUELEND_ENV` values, so two instances), and the group-A rows for
`/api/applications*` are only reachable now that the later groups' endpoints
exist. The doc's note about an xfailed
`test_e1_s1_ac4_customer_forbidden_on_audit` is stale: the suite has no xfail
markers left and the behaviour (403 for a CUSTOMER on `/api/audit`) is verified
live as QA-VM-004.

## features.json

Updated `passes`, `last_evaluated`, `failure_reason`, `failure_layer` only;
`id`, `category`, `story`, `group`, `cluster`, `acceptance_criterion`,
`description`, `steps` and `verification` are untouched.

- **71 of 73 pass.**
- F005 — `false`, `failure_layer: "api"` (QA-VM-005, ADMIN gate on `/api/_test/boom`).
- F013 — `false`, `failure_layer: "api"` (QA-VM-013, document id absent from logs).

## What blocks the sprint

1. QA-VM-005 — `/api/_test/boom` (and `/api/_test/audited-action`) authenticated but not role-gated, against the contract's ADMIN clause.
2. QA-VM-013 — document id missing from the logs (E1-S3-AC4, second half).
3. Security gate — no `security-verdict.json`; run the `security-reviewer` via `/gate`.

Advisory, non-blocking: no `design_checks` in any contract (design layer
unscored), `/metrics` missing while `observability.enabled` is true, one
`color-contrast` incomplete in axe, and the perf baseline captured for the first
time (ratchet live next run).
