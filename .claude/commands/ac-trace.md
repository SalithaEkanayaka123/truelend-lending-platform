---
description: Map requirements (FR, AC, D-nn, NFR, story criteria) to the tests that carry them, with the read-only ac-traceability agent. Use before closing a sprint or opening a PR that adds tests or changes a spec.
argument-hint: "[F0..F5 | sprint 1 | sprint 2 | ids...]  (default: everything)"
allowed-tools: Agent
---

Build the requirement-to-test coverage map. This command only reads; it edits nothing.

<steps>
1. Take the scope from `$ARGUMENTS`: a feature (`F3`), a sprint (`sprint 1` is F0 to F3, `sprint 2` is F4 and F5), or explicit ids. Empty means everything.
2. Spawn the `ac-traceability` agent with that scope.
3. Report the agent's result: lead with the totals (covered, planned, missing, orphan, renamed), then the gaps grouped by feature, then the full table.
4. When no tests exist yet, say that every id is planned or missing instead of presenting it as a failure.
</steps>

Gaps are advisory. Adding tests or updating a spec's test list is a separate change.
