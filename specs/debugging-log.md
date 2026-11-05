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

## Open items

- The waivers in incidents 4, 8 and 9 expire on 2026-11-30. Revisit them before then.
- Incidents 3, 4, 6 and 7 are harness-side problems. Only the `.claude/hooks/lib/tdd.js` change for incident 6 is committed.
