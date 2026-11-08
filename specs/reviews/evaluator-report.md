# Evaluator Report — Sprint 1 (groups A–G)

Date: 2026-11-08T05:20:00Z
Branch: `feat/sprint-1` · Mode: **Full** · `verification.mode: local`

VERDICT: PASS — all contracted checks pass across every layer.

## How the app was run

No product code was changed. Each group was replayed against its **own freshly
booted backend** (`TRUELEND_ENV=test`, scratch SQLite DB, private copy of
`policy_v0001.json`) so the contracts' canonical ids hold. Extra instances were
booted for rows needing different process state: `TRUELEND_ENV` unset and
`=production` (QA-VM-014-NT), and a restart on the same DB after tampering with
`policy_v0001.json` (QA-VM-024). Health was polled before every check.

## Per-group verdict

| Group | API | Browser | a11y | Verdict |
|---|---|---|---|---|
| A | 16/16 (+QA-VM-014-NT) | — | — | **PASS** |
| B | 9/9 | — | — | PASS |
| C | 11/11 | — | — | PASS |
| D | 5/5 (+CR-001) | 3/3 | 0 violations | PASS |
| E | 11/11 | — | — | PASS |
| F | 8/8 | 3/3 | 0 violations | PASS |
| G | — | 3/3 | 0 violations | PASS |

Totals: **59/59 contracted API checks**, **9/9 Playwright**, **3/3 a11y blocks**.

## The two prior failures are fixed

- **QA-VM-005 / F005** — `/api/_test/boom` and `/api/_test/audited-action` are
  now ADMIN-gated: ANON 401, CUSTOMER/POLICY_EDITOR/UNDERWRITER **403
  FORBIDDEN**, ADMIN 500 `INTERNAL_ERROR` / 200. `/openapi.json` still shows
  only `GET /health` and `POST /api/auth/login` without an auth dependency.
- **QA-VM-013 / F013** — the upload path now emits
  `{"event": "DocumentUploaded", …, "application_id": 1, "document_id": 3,
  "document_type": "SALARY_SLIP"}`; the document id is present and
  `salary_slip_jan` appears in no log line.

## CR-001 (commit 7e46a52) — verified

Upload after submission → **409 `ALREADY_SUBMITTED`**, and the stored
`ID_PROOF` filename is still `id_front.png`, so the record was not overwritten.
QA-VM-030…034 all pass around it (checklist `UPLOADED`,
`DOCUMENT_TYPE_NOT_REQUIRED`, `MISSING_DOCUMENTS` with status held at `DRAFT`,
`SUBMITTED`/`policy_version=1`, re-submit `ALREADY_SUBMITTED`), and
`application_documents` has no file-content column.

## Group E — document service re-verified live

`document_service.py` is the file both fix commits touched, so group E was
replayed rather than inferred: queue of 3 oldest-first (`document_id [1,2,3]`),
verify → `VERIFIED`/`verified_by=3`/`DOCUMENT_VERIFIED`/left the queue, reject →
`DOCUMENT_REJECTED` with the application still `SUBMITTED`, reason
missing/empty/501-char → 422 ×3 with no audit row, CUSTOMER 403 ×2, re-verify
409 `ALREADY_VERIFIED`.

## Browser and accessibility

All nine contracted browser checks ran in real chromium against the real backend
and Vite (`cd e2e && npx playwright test` → **93 passed**), semantic locators
only, no `waitForTimeout`. axe-core 4.10.2 was injected and run over 3 page
states: **0 violations at any impact**, so 0 in `block_impacts`. Evidence:
`evaluator-e2e-results.txt`, `evaluator-axe.json`, ledgers
`evaluator-evidence{,-D,-F,-G}.json`.

## Gates

- **Security** — `security-verdict.json#pass: true` (block 0, warn 8, info 8).
- **Evidence integrity** — `--group {D,F,G}` → exit 0 each, "3 browser check(s)
  backed by user-path interaction".
- **Performance ratchet** — no regression: `/health` p95 2.96 → 3.47 ms (+17%),
  `/openapi.json` 3.22 → 4.57 ms (+42%); both inside the 50% threshold and far
  inside the 300 ms read budget.
- **Suites** — backend `pytest` **202 passed**, e2e **93 passed**.
- **Architecture / design** — no contract declares `files_must_exist` or
  `design_checks`; the design layer is unscored (a contract gap, not a pass).

## Advisory (non-blocking)

1. **Correlation-id over-redaction** — `_AADHAAR_SPACED_RE`
   (`\b\d{4}[ -]\d{4}[ -]\d{4}\b`, `config/logging.py:23`) also matches digit
   runs *inside* a correlation id. `X-Correlation-ID: 1234-5678-9012` is echoed
   verbatim but logged as `[REDACTED]`, and a UUID4 whose middle groups are all
   digits (e.g. `b60ddde9-2906-4704-9590-565c687d5215` → `b60ddde9-[REDACTED]-…`)
   is partially masked, breaking end-to-end traceability for ~0.6% of generated
   ids. Pre-existing (`logging.py` untouched since 37fd888), outside E1-S3-AC2's
   three enumerated cases, so not a contracted failure — but it defeats E1-S3's
   stated business value. Recommend redacting before the correlation id is
   merged into the record, or exempting that field.
2. `/metrics` returns 404 while `observability.enabled: true` → SLO sensor
   `unreachable` (WARN by rule). No Sprint-1 AC requires a metrics endpoint.
3. No `design_checks` in any contract, so Layer 3 scored nothing.

## Harness (not product) corrections made to the replay scripts

`run_a.py` asserted a **flat** `body.code`, but the designed `ErrorEnvelope` is
`{"error": {code, message, correlation_id}}` (`api-contracts.schema.json#/components/schemas/ErrorEnvelope`),
and `errors.py` is unchanged since before the last evaluation. That made
QA-VM-002/004/014 report `code: None` and fail spuriously; `lib.code()` now
reads the nested envelope and all three pass. Two ad-hoc probes left over from
the fix session also asserted codes the contract never specifies —
`QA-VM-012-code` expected `VALIDATION_ERROR` where the contract (QA-VM-027)
requires `TENURE_OUT_OF_RANGE`, and `QA-VM-009`'s extra clause expected
`CONFLICT` where the test fixture route deliberately raises `TEST_CONFLICT`
(`main.py:161`). Neither is a contracted clause; the contracted behaviour holds.

## features.json

**73 of 73 pass.** `passes`, `last_evaluated`, `failure_reason`, `failure_layer`
only; F005 and F013 flipped `false → true`. Identity fields untouched.
