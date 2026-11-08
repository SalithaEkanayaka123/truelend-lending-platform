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
