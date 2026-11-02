# Backend (Python 3.12 · FastAPI · SQLite)

## Commands (run from this directory)

- `uv run pytest -x -q` — tests
- `uv run ruff check --fix .` — lint
- `uv run mypy src/` — types

## Layout

Code lives in `src/truelend/<layer>/`, lowest to highest: `types`, `config`, `repository`, `service`, `api`. Layer names are singular (`service`, not `services`). Imports go one way only: never from a higher layer.

- Architecture: `docs/architecture.md`; layer rules and verification: `.claude/architecture.md`.
- Layer config: `architecture` block in `project-manifest.json` (the gate only sees `src/truelend/<layer>/` paths).
- Entities, endpoints and ACs per feature: `specs/features/F0..F5`; requirements: `specs/prd.md`.
- Policy files in `policies/`, migrations in `migrations/` — both append-only (new file, never an edit).

## Rules

- **TDD:** failing test first (`quality.test_discipline: tdd`). Test names and tags: skill `ac-tagged-tests`. Test dirs: `tests/{unit,api,repo,architecture}`.
- **Money:** `Decimal` only, strings on the wire, never `float` — skill `truelend-domain`, `F0` FA-F0.1.
- **Logs:** never write PAN, Aadhaar, salary documents or document filenames — NFR-03, `F0` FA-F0.6.
- **Auth and audit:** guard at the router; audit in the action's transaction — `F0` FA-F0.2, FA-F0.4.
- Full type annotations; functions ≤ 30 lines, files ≤ 300 lines.

## Checks before a PR

`/nfr-check` (NFR-01..05 on the diff) and `/ac-trace` (AC to test coverage).
