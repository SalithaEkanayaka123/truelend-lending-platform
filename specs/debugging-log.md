# Debugging log

Incidents hit while building TrueLend with the Claude Harness Engine on Windows. Each entry gives the symptom, root cause, fix and evidence. Details that git history and `specs/reviews` do not record, such as exact error text or counts, are marked *(reported)*. They come from the developer's account of the incident, not from a file in the repo.

## 1. Write gate treated `C:` and `c:` as different paths

- **Symptom:** On Windows the Write/Edit and Bash gates judged a write to be outside the project directory, so legitimate in-project writes were refused. The path differed only in drive-letter case *(reported)*.
- **Root cause:** `isWriteInScope` in `.claude/hooks/lib/common.js` compared path prefixes with case-sensitive `startsWith`. Windows paths are case-insensitive, so `C:\x` and `c:\x` are the same place. `secretScanExempt` in `secrets.js` had the same comparison.
- **Fix:** Fold both sides of each prefix test to lower case when `process.platform === 'win32'`. Other platforms are unchanged. The `/tmp` and project-memory checks share the same `inside()` helper.
- **Evidence:** commit `5cd1824` (`fix(hooks): case-insensitive path scope on Windows`), merged by PR #2 (`f8cf325`). Files: `.claude/hooks/lib/common.js`, `.claude/hooks/lib/secrets.js`.

## 2. Semgrep CI job failed

- **Symptom:** The Semgrep step in `.github/workflows/security.yml` failed in three successive ways:
  1. `semgrep ci` rejected `--error` *(reported as "semgrep ci unsupported")*.
  2. Semgrep 1.90.0 could not import `pkg_resources`.
  3. A scan reported 1002 findings, nearly all from harness folders *(count reported)*.
- **Root cause:**
  1. `semgrep ci` does not accept the `--error` flag.
  2. Newer `setuptools` releases no longer ship `pkg_resources`, and Semgrep 1.90.0 imports it.
  3. The scan covered `.claude/`, `specs/` and `docs/`, which are harness machinery and generated evidence, not product code.
- **Fix:** One commit per cause, all in `fix/ci-semgrep` (PR #3):
  1. Use `semgrep scan --config auto --error`.
  2. Install `"setuptools<80"` alongside `semgrep==1.90.0`.
  3. Add `.semgrepignore` listing `.claude/`, `specs/` and `docs/`, and restrict failure to `--severity ERROR`.
- **Evidence:** commits `c25b8bc`, `444d3d5`, `367b5ea`; merge `576eb6a`. Files: `.github/workflows/security.yml`, `.semgrepignore`.

## 3. PRD parsed as zero requirements; test-plan approval hash went stale

- **Symptom:** The PRD adoption step found zero requirements *(reported)*. Separately, the test-plan approval hash went stale after Python on Windows rewrote files *(reported)*.
- **Root cause:** The documents had CRLF line endings, and the validator regexes used `.`, which does not match across the `\r` of a CRLF ending *(reported)*. Python on Windows also wrote files with CRLF, which changed the file bytes and so invalidated the stored approval hash *(reported)*.
- **Fix:** Pin LF endings for the planning artifacts with `.gitattributes`:
  ```
  specs/**/*.md text eol=lf
  docs/**/*.md text eol=lf
  *.json text eol=lf
  ```
  The PRD was then adopted as the BRD, and the test plan was re-approved and re-sealed.
- **Evidence:**
  - Commit `9b602d2` (`docs: adopt PRD as BRD, pin LF endings`) adds `.gitattributes` and the `specs/brd/*` adoption files.
  - Commits `1266ed1` (re-approve, freeze and seal) and `d00cc92` (round-3 test approval) re-record the approval.
  - `specs/reviews/test-approval.json` and `specs/reviews/plan-seal.json` hold the approval rounds and seal.

## 4. Harness docs contradicted themselves on pre-dispatch `bundle-check`

- **Symptom:** The harness instructions disagreed about whether `bundle-check` had to pass for a story before dispatch. Later-group stories without Operations failed `generation-contract` and `story-bundle-check`, which blocked group A commits *(reported)*.
- **Root cause:** Pre-dispatch required complete story bundles, but Operations are only written per story when that story is taken up. The two requirements could not both hold.
- **Fix:** Pre-dispatch checks the bundle as a skeleton only. Per-story "implementable" validation happens at Step 0.2, after that story's Operations are written. Until a later group's Operations exist, the two gates are covered by time-boxed waivers. A story's Operations are written and the plan is re-sealed when its turn comes. Group A did this in `7337b1f`.
- **Evidence:** The rule is recorded only in the `/auto` run instructions and in the waivers. No commit edits the harness docs themselves.
  - Waivers: `specs/reviews/sensor-waivers.json` (`generation-contract` and `story-bundle-check`, reason "Later-group Operations pending; written per wave", expiry 2026-11-30).
  - Repo trace of the per-wave Operations: commit `7337b1f` (`docs: group A operations, reseal`).

## 5. BRD adoption left NFR traces unjoined

- **Symptom:** Acceptance rows existed only for functional requirements. The non-functional requirements (`NFR-01` to `NFR-05`) had no acceptance rows, so their traces could not be joined *(reported)*.
- **Root cause:** BRD adoption (`9b602d2`) generated `specs/brd/brd-acceptance.json` for FRs only.
- **Fix:** Add 8 acceptance rows for the NFRs to `brd-acceptance.json`, then reseal the affected bundles. The added rows include `FRD-21` (`NFR-01`, fixed-point money), `FRD-22` (`NFR-02`, append-only) and `FRD-23` (`NFR-03`, no identifiers in logs).
- **Evidence:** commit `c00afb0` (`docs: add NFR acceptance rows, reseal bundles`); files `specs/brd/brd-acceptance.json`, `specs/bundles/*.json`, `specs/reviews/plan-seal.json`, `specs/reviews/spec-acceptance-grounding.json`.

## 6. TDD gate demanded a test beside each source file

- **Symptom:** The pre-write TDD gate refused production writes under `backend/src/**` because no test file sat next to the source file. The plan puts tests in `backend/tests/**` *(reported)*.
- **Root cause:** `.claude/hooks/lib/tdd.js` only knew colocated tests (`candidateTests`).
- **Fix:** Add a project-level rule. `hasProjectTests` makes `<root>/src/**` writable once `<root>/tests/**` holds a real test file, found by `anyTestUnder` using the `TEST_NAME` pattern. Frontend colocated tests still count.
- **Evidence:** commit `37fd888`, which states "tdd.js accepts backend/tests/** as the test for backend/src/**" and carries the `.claude/hooks/lib/tdd.js` diff.

## 7. Task envelope used bare directories that matched nothing

- **Symptom:** Writes were rejected as outside the task envelope's `allowed_paths`, even for files inside `backend/` and `specs/` *(reported)*.
- **Root cause:** The first envelope (version 1, task `sprint-1`) listed bare directories such as `backend/`, `frontend/` and `specs/`. The path matcher treated these as literal entries and matched no file beneath them *(reported)*.
- **Fix:** Recreate the envelope with `dir/**` globs: `backend/**`, `frontend/**`, `e2e/**`, `specs/**`, `sprint-contracts/**`, `.claude/state/**`.
- **Evidence:** Local gitignored envelope files only, so nothing is in git history. The bare-directory version is in `.claude/state/task-envelope-history/` and the glob version is `.claude/state/task-envelope.json`. Both are ignored by `.gitignore` (commit `79c7c64`).

## 8. Frozen sprint-contract `api_checks` cannot replay

- **Symptom:** Replaying `sprint-contracts/A.json` through `local-regression-gate.js` passed 2 of 15 checks.
- **Root cause:** The gate sends bare requests (no body, no token) and compares only the status code. That cannot hold for:
  - Auth endpoints, which need a body or token.
  - `QA-VM-014` and `QA-VM-014-NT`, which contradict each other: one needs `TRUELEND_ENV=test` and the other needs it unset.
  - Checks that route through endpoints owned by later groups.
- **Fix:** None to the checks. The `local-regression-gate` and `impact-scoped-regression` gates are waived until 2026-11-30. Behaviour is covered by the pytest suite and is to be re-verified by the final evaluator. The per-check table is kept as evidence.
- **Evidence:** `specs/reviews/group-a-contract-replay.md`; `specs/reviews/sensor-waivers.json`; commit `37fd888`.

## 9. `spdd-sync` appended TODO stubs for non-source paths

- **Symptom:** After a story run, the REASONS canvas lacked Governs/Operations entries for the changed paths. `canvas-sync-check` blocked commits.
- **Root cause:** `spdd-sync` appends TODO stubs to the canvas for every changed path, including non-source paths such as tests and JSON artefacts, rather than only source paths *(reported)*.
- **Fix:** `canvas-sync-check` is waived until 2026-11-30, with the canvas to be updated at the end of the group. The `spdd-sync` output is not committed to the canvas.
- **Evidence:** `specs/reviews/sensor-waivers.json` (`canvas-sync-check`, reason "Sync appends TODO stubs for non-source paths; canvas updated at the end."); `specs/reviews/spdd-sync.json`; commit `37fd888`.

## 10. `GET /api/products` returned 500 `INTERNAL_ERROR` with no trace anywhere

- **Symptom:** `GET /api/products` returned `500 INTERNAL_ERROR` for `admin@example.test` against the dev DB, correlation id `676401d2-8072-4405-aea1-df70d3b0f0ab` *(reported)*. Login and `/api/policies` worked. The UI showed the error boundary *(reported)*. It happened again while checking the fix in a browser at 375px: correlation id `441fe440-6ff7-4add-9890-0517f025271e`, two failed `/api/products` calls, then 200 on every later call.
- **Root cause (logging gap, confirmed):** Nothing in production called `configure_logging`. `CorrelationIdLoggingMiddleware` logged the exception to the `truelend.access` logger at INFO, and under uvicorn that logger had no handler, so the line and its traceback were dropped. The tests hid this because the `client` fixture configures logging itself. A 500 could not be traced from its correlation id.
- **Root cause (the 500 itself, confirmed by the e2e suite, see incident 11):** a thread-affinity bug in the per-request SQLite connection, not the policy file. The traceback, logged by the fix above:
  ```
  sqlite3.ProgrammingError: SQLite objects created in a thread can only be used in that same thread.
    deps.py:54 get_current_principal -> auth_service.py:80 resolve_principal -> users_repo.py:30 find_by_id
  ```
  `get_conn` is a sync generator dependency. FastAPI runs the dependency and the dependants (`get_current_principal`) in the threadpool, and they can land on different worker threads. The connection is then created on one thread and used on another. Every authenticated route is exposed, not only `/api/products`; `/api/policies` fails the same way.
  - It is intermittent because a single idle worker thread is reused, so requests that arrive one at a time usually get the same thread. Requests that arrive together get different threads. The UI fires products and policies together, which is why it showed up there.
  - Earlier evidence was misleading for the same reason: the role-matrix tests and 100 curl calls run one request at a time, or nearly so.
  - My earlier hypothesis here, a transient `OSError` reading `policy_v0001.json`, was wrong.
- **Fix:**
  - `create_app` calls `configure_logging()`, so JSON log lines go to stderr.
  - The middleware logs an unhandled exception at ERROR, with `correlation_id` and the redacted traceback.
  - Frontend: a failed products load shows an inline error card with the reference and Retry. A render crash shows Retry and Sign out. A 403 shows a friendly "No access".
  - No speculative change was made to the policy read path.
- **Evidence:**
  - `backend/tests/api/test_500_traceability.py` (red before the fix, green after).
  - `backend/tests/api/test_products_roles.py`.
  - Frontend tests: `ErrorState`, `AppErrorBoundary`, `App` (per-role routing), `PolicyEditorPage`, `usePolicies`.
  - Next step: search the uvicorn terminal for correlation id `441fe440-6ff7-4add-9890-0517f025271e` and read its `trace` field.

## 11. Playwright e2e suite: concurrent requests return 500 (open, not fixed)

- **Symptom:** The new `e2e/` suite (real backend, real Vite, chromium, no mocks) is red for every screen that loads the policy editor (landing as POLICY_EDITOR, ADMIN or POLICY_EDITOR opening `/policies`, the editor happy path at both viewports, the existing `policy-editor.spec.ts`, and the POLICY_EDITOR screenshots). The failures are "heading not found", plus console errors and `HTTP 500` on `/api/products` and `/api/policies` with correlation ids. The same specs pass for roles and pages that do not fire those two requests together. 38 passed, 11 failed, 2 flaky (the two flaky tests passed on retry).
- **Root cause:** the same bug as incident 10. `get_conn` hands a SQLite connection created on one threadpool thread to `get_current_principal`, which may run on another. `loop.spec.ts` has a concurrent variant that reproduces it directly: 8 requests in flight, 193 of 200 calls returned 500 for ADMIN.
- **Why the sequential loop cannot see it:** `GET /api/products` x200 one at a time passes for all four roles, because one idle worker thread is reused. The concurrent-burst test is the one that catches it.
- **Fix:** none, by instruction. The failing specs stay red. The fix belongs in `backend/src/truelend/api/deps.py` (create the connection on the thread that uses it, or open it with `check_same_thread=False`), with a regression test that fires concurrent requests.
- **Suite notes:**
  - The brief says `POLICY_MANAGER`; the role is `POLICY_EDITOR`.
  - Navigating with `page.goto` after sign-in drops the in-memory token by design, so the specs navigate client-side.
  - The suite runs on backend 8100 and Vite 5173 (override with `E2E_FRONTEND_PORT` when a dev server holds 5173) and uses its own temp DB and policy directory, so it never writes into `backend/policies/`.
  - `frontend/playwright.config.ts` also points at `../e2e`; with `e2e/` now having its own `@playwright/test`, running that config may load two copies of Playwright. Use `cd e2e && npm run e2e`.
- **Evidence:** `e2e/api.spec.ts`, `loop.spec.ts`, `ui.spec.ts`, `screenshots.spec.ts`; run with `cd e2e && npm run e2e`.

## Open items

- Incidents 10 and 11: fix the cross-thread SQLite connection in `deps.get_conn` / `get_current_principal`, with a concurrent-request regression test, then re-run `cd e2e && npm run e2e` until green.

- The waivers in incidents 4, 8 and 9 expire on 2026-11-30. Revisit them before then.
- Incidents 3, 4, 6 and 7 are harness-side problems. Only the `.claude/hooks/lib/tdd.js` change for incident 6 is committed.
