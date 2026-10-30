# Codebase Wiki

> Deterministic, always-current map rendered from `code-graph.json`. No LLM — re-rendered on graph change.

- Producer: `vendored-ast`  ·  Language: `mixed`
- Modules: 5  ·  Edges: 3  ·  Clusters: 4

## Hubs (most-depended-on)

| Module | fan-in | fan-out |
|---|---|---|
| `js:frontend/eslint.config.mjs` | 0 | 2 |
| `ts:frontend/vitest.config.ts` | 0 | 1 |

### Entry points (no inbound deps)

- `js:frontend/eslint.config.mjs`
- `py:backend/src/__init__.py`
- `py:backend/tests/__init__.py`
- `ts:frontend/src/env.d.ts`
- `ts:frontend/vitest.config.ts`

### Cycles

_(none)_

### External dependencies

_(none)_

## Pages

- [`frontend/` — 2 module(s)](pages/01-frontend.md) — 2 module(s)
- [`backend/src/` — 1 module(s)](pages/02-backend-src.md) — 1 module(s)
- [`backend/tests/` — 1 module(s)](pages/03-backend-tests.md) — 1 module(s)
- [`frontend/src/` — 1 module(s)](pages/04-frontend-src.md) — 1 module(s)

## Agent navigation

- Context pack: `node .claude/scripts/nav-query.js pack --budget 1600 "<question>"`
- Refresh secondary indexes: `node .claude/scripts/nav-query.js refresh`
