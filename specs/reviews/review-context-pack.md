# Review Context Pack - Sprint 1 close (/gate)

- Request: /gate, Sprint 1 close, range `main..HEAD` on `feat/sprint-1`. Stories E1-S1..E4-S2 (groups A-G).
- Scope rules: fix only F005/F013 (already fixed in 3a78015, 4bc9347); report every other finding, do not fix. No waivers. No push/merge.
- Acceptance criteria: `specs/stories/acceptance-criteria.json`, sprint contracts `sprint-contracts/{A..G}.json` (read-only).
- Diff: `git diff main..HEAD` (production: `backend/src/truelend/**`, `frontend/src/**`). Prior evaluator FAIL: QA-VM-005 (F005, ADMIN-only `_test` routes), QA-VM-013 (F013, document id in upload log) - fixed since.
- Deterministic output (2026-11-08): backend pytest 201 passed, ruff clean, mypy clean (42 files); frontend lint/typecheck clean, vitest 250 passed.
- Registry sweep (`run-gate-checks.js --lane gate`): blocked canvas-sync (only `.claude/state/phase-cost*.json` unlisted), ownership-check (unowned: __init__.py files, review_router.py, many frontend src files not in component-map), regression-suite-full (no server up; status 0), evidence-integrity (ledger spans groups; must re-run after evaluator), perf-smell (`backend/src/truelend/config/db.py:108` loop query).
- Risk triggers: auth/authz (auth_router, deps, auth_service), uploads (documents_router/service), persistence/migrations (config/db.py, repository/*), API routes/middleware, logging of PII. Security review REQUIRED, 3-instance re-verification.
- Navigation: `specs/brownfield/wiki/WIKI.md`, `specs/brownfield/symbol-map.md`, `specs/design/component-map.md`.
