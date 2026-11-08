# Open gate findings — sprint-1 (feat/sprint-1)

Recorded 2026-11-08 from the interrupted /gate run (partial review artifacts, not re-run by decision).
Sources: `code-review.md`, `security-review.md`, `perf-smell-gate.md`, `observability-gate.md`.

## Fixed

- **CR-001** (BLOCK) — re-upload after submission un-verified a VERIFIED document.
  Fixed in `7e46a52`: `upload_document` raises `AlreadySubmittedError` unless the application is DRAFT.
  Test: `test_e3_s1_ac5_reupload_after_submission_is_rejected_and_verified_stays_final`.

## Open — security (`security-review.md`, overall WARN, 0 BLOCK)

- **VULN-001** Default JWT signing secret with no production guard (matches CR-015). Suggested fix: require
  `TRUELEND_JWT_SECRET` when `env` is not `test`/`dev`.
- VULN-002..VULN-016: open, see `security-review.md` (demo password, no login throttling, unauthenticated
  OpenAPI, no security headers, npm advisories, PAN/Aadhaar at rest, non-constant-time hash compare, path echoed
  in 500 body, no token revocation, filename length, CORS, test fixtures credentials, runtime `assert`).

## Open — code review WARN (`code-review.md`)

CR-002 stale verifier attribution on reset row · CR-003 UI `min_age == max_age` stricter than backend ·
CR-004 `_correlation_id` duplicated x4 · CR-005 `DatabaseError` mapped to domain 409 · CR-006 policy responses
omit `sha256`/content · CR-007 timestamps `+00:00` not `Z` · CR-008 out-of-sprint E5 screens shipped ·
CR-009 eight tests cite non-existent `E2-S4-AC4` · CR-010 response shape divergence · CR-011 file ownership vs
component-map · CR-012 policy editor parses 422 prose · CR-013 wire types weakened to `string` ·
CR-014 customer home label mismatch · CR-015 default JWT secret (= VULN-001).

## Open — code review INFO

CR-016 .. CR-023 (event published after commit, `catalog[0]`, dead protocols, `Money` bypass, status-map order,
demo-scale query patterns, test routes in prod factory, no UNIQUE on checklist rows).

## Open — deterministic gates

- perf-smell: BLOCK `PERF-N1-LOOP-QUERY` at `backend/src/truelend/config/db.py:108` (demo-user seed loop).
- observability: WARN `OBS-BOUNDARY-NO-LOGGER` across routers and frontend modules.
