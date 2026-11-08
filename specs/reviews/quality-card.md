# Quality card

Generated: 2026-11-08T05:22:33.817Z

**Overall: FAIL** — 5 pass · 3 fail · 1 missing · 5 skipped

| Check | Status | Detail |
|---|---|---|
| evaluator | ✅ pass | — |
| code_review | ⬜ missing | — |
| security | ✅ pass | [object Object] |
| ownership | ❌ fail | — |
| regression | ❌ fail | blocked |
| verification_matrix | ✅ pass | — |
| evidence_integrity | ✅ pass | 3 browser check(s) backed by user-path interaction |
| observability | ✅ pass | [object Object] |
| perf_smell | ❌ fail | [object Object] |
| slo | ❓ unknown | unreachable |

## Human navigation

- [`specs/brownfield/wiki/WIKI.md`](../../specs/brownfield/wiki/WIKI.md)
- [`specs/brownfield/symbol-map.md`](../../specs/brownfield/symbol-map.md)

## How to use this card

1. Confirm **Overall PASS** before opening or merging a PR.
2. Read `specs/reviews/walkthrough.md` for a logical (non-alphabetical) change tour.
3. Read `docs/CODEBASE.md` for system orientation without opening every source file.
4. Drill into failing rows via the matching file under `specs/reviews/`.
