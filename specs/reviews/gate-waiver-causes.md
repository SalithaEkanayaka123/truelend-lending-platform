# Gate waiver causes — 2026-11-08

## regression-suite-full (waived)
`regression-gate-verdict.json`: every replayed `sprint-contracts/A.json` api_check reports "got 0" (no HTTP
response: no server up, and the checks are bare requests with no body/token and fixed statuses that cannot hold
for auth endpoints; QA-VM-014/-NT contradict each other). Same mismatch already waived as
`impact-scoped-regression`. Not a product regression: backend pytest and e2e pass.

## perf-smell (waived)
`config/db.py:108` loops over `_SEED_USERS`, a constant 5-row tuple, running `INSERT OR IGNORE` once per row at
startup, then one commit. Not a request path; no unbounded load. Batching would be a product-code change, out of
scope for this time-boxed fix.

## evidence-integrity
See result of the evaluator re-run below, if a waiver was needed.

(Test count correction: backend pytest is 202 passed, not 203.)

## evidence-integrity
No waiver needed: the evaluator re-run produced evidence that passes (exit 0 for groups D/F/G).

## Quality card (2026-11-08, after evaluator PASS)
evaluator, security, verification_matrix, evidence_integrity, observability: pass. ownership, regression, perf_smell
show fail because the card reads raw verdict files and does not apply sensor-waivers.json (waived above / group A).
code_review: missing — no code-review-verdict.json was produced by the interrupted gate; not hand-written.
slo: unreachable (`/metrics` 404).
Advisory product defect (not fixed, out of scope): `config/logging.py:23` Aadhaar regex redacts digit runs inside
correlation ids.
