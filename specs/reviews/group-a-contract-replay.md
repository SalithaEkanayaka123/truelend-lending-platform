# Group A sprint-contract replay (evidence for the G16 / impact-scoped-regression waivers)

Run: 2026-11-05, backend started with `TRUELEND_ENV=test` on `http://localhost:8000`, then
`node .claude/scripts/local-regression-gate.js` replayed `sprint-contracts/A.json` (15 api_checks).
The gate sends bare requests (no body, no token) and compares only the status code.

| Check | Request | Expected | Got | Why it cannot pass as written |
|---|---|---|---|---|
| QA-VM-001 | POST /api/auth/login | 200 | 422 | no body sent; description itself expects a real login |
| QA-VM-002 | POST /api/auth/login | 200 | 422 | description expects 401 for wrong credentials |
| QA-VM-003 | GET /api/auth/me | 200 | 401 | no token; description expects 401 for missing/expired token |
| QA-VM-004 | GET /api/audit | 200 | 404 | route belongs to E1-S2 (not built); description expects 403 for CUSTOMER |
| QA-VM-005 | GET /openapi.json | 200 | 200 | pass |
| QA-VM-012 | POST /api/applications | 200 | 404 | endpoint owned by a later group |
| QA-VM-013 | POST /api/applications/{id}/documents | 200 | 404 | endpoint owned by a later group |
| QA-VM-014 | GET /api/_test/boom | 500 | 401 | route requires a token (E1-S1 AC5); needs TRUELEND_ENV=test |
| QA-VM-014-NT | GET /api/_test/boom | 404 | 401 | contradicts QA-VM-014 (needs TRUELEND_ENV unset); same server cannot satisfy both |
| QA-VM-015 | GET /health | 200 | 200 | pass |
| QA-VM-043..047 | POST /api/applications/1/underwrite | 200 | 404 | scoring is a pure function in group A; endpoint owned by a later group |

Result: 2 pass, 13 fail. Behaviour for the failing rows is covered by the pytest suite
and is to be re-verified by the final evaluator.
