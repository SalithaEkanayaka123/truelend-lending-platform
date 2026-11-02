# Frontend (React · TypeScript · Vite)

## Commands (run from this directory)

- `npm test` — Vitest
- `npm run lint` — ESLint
- `npm run typecheck` — tsc

Playwright E2E specs live in `../e2e/`; the Playwright MCP is configured in `../.mcp.json`.

## Layout

Code lives in `src/<layer>/`, lowest to highest: `types`, `config`, `repository`, `service`, `ui` (the `api` layer is unused here). Imports go one way only: never from a higher layer.

- `repository/` — the typed API client; nothing else calls `fetch`.
- `service/` — hooks that fetch and shape data through the client.
- `ui/` — components (`ui/components/`, one per file) call hooks, not the client; pages in `ui/pages/`.
- Architecture: `docs/architecture.md`; layer rules: `.claude/architecture.md`; layer config: `architecture` block in `project-manifest.json` (the gate only sees `src/<layer>/` paths).
- Screens, endpoints and ACs per feature: `specs/features/F0..F5`; design bar: root `CLAUDE.md`.

## Rules

- **TDD:** failing test first (`quality.test_discipline: tdd`). Test titles and tags: skill `ac-tagged-tests`.
- **Money:** the API sends 2-decimal strings. Display only; no arithmetic with `Number` (NFR-01). Skill `truelend-domain`.
- **No PII in the console or logs:** show masked PAN and Aadhaar as returned; never log application data (NFR-03).
- No `any`; use `unknown` and narrow.
- **Responsive:** every screen is checked at 375×812 and 1280×800 with no horizontal scroll (feature-spec UI ACs).
- The UI shows decisions; it never makes them — the backend decides.

## Checks before a PR

`/nfr-check` and `/ac-trace`.
