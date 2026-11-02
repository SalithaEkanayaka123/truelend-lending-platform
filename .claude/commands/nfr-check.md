---
description: Review the current diff against NFR-01..NFR-05 with the read-only nfr-reviewer agent. Use before opening a PR that touches money, persistence, logging, routes, audit, migrations or policy files.
argument-hint: "[base-ref]  (default: merge-base with develop, else main)"
allowed-tools: Bash(git diff:*), Bash(git merge-base:*), Bash(git branch:*), Bash(git status:*), Agent
---

Review the working tree and branch changes against NFR-01..NFR-05. This command only reads; it edits nothing.

<steps>
1. Pick the base: `$ARGUMENTS` if given; otherwise the merge-base of `HEAD` with `develop` when that branch exists, else with `main`.
2. Collect the change set with `git diff <base> -- backend frontend .claude/hooks`, and `git status --short` for untracked files; read untracked files directly.
3. If the change set is empty, report that and stop.
4. Spawn the `nfr-reviewer` agent with the diff and the list of changed files as its input.
5. Report the agent's result: lead with the number of findings by severity, then the findings grouped by NFR, each with file, line, evidence and fix. Show the `coverage` line for all five NFRs, including the clean ones.
</steps>

Findings are advisory. Fixing them is a separate change.
