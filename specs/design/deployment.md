# Deployment — TrueLend M1

Scope per SG-6: no production deployment, secret management service,
multi-region operation, or distributed locking. This is a local,
demo-ready single-command run (D-D).

## Environments

| Environment | Purpose | How it runs |
|---|---|---|
| Local (dev) | Inner loop, hot reload | `cd backend && uv run uvicorn truelend.api.main:app --reload`; `cd frontend && npm run dev` — the no-Docker fallback D-D keeps available. |
| Local (demo/CI) | Single-command run matching the README quick-start | `./init.sh` → Docker Compose builds and starts `backend` and `frontend`, running migrations and seeds before either reports ready. |
| CI (GitHub Actions) | Lint, typecheck, test, build on every PR | `.github/workflows/ci.yml` (backend: ruff, mypy, pytest --cov; frontend: eslint, tsc, vitest, playwright). |

## `init.sh` contract

1. Build backend and frontend images via `docker-compose build`.
2. Start the `backend` service; it runs `run_migrations()` then `seed()`
   (users + policy v1 APPROVED) before binding the HTTP port, so `GET
   /health` never returns `200` against an unmigrated or unseeded database
   (E1-S4-AC1..AC3).
3. Start the `frontend` service, pointed at the backend's base URL via
   `evaluation.api_base_url` (`project-manifest.json`).
4. Print the seed demo accounts and the two URLs (API, UI) to stdout.
5. Exit non-zero if any container fails its health check within a bounded
   timeout, so CI fails fast instead of hanging.

## Secrets

`TRUELEND_JWT_SECRET` (D-G) is read from the environment; `docker-compose.yml`
sources it from a local `.env` (git-ignored) with a generated demo default
for the no-Docker fallback. No other secret exists in M1 — SQLite is a file,
not a managed service, and SG-6 rules out a secret manager.

## Database and migrations

SQLite file lives in a named Docker volume so `docker compose down` without
`-v` preserves demo data between runs; `docker compose down -v` resets to a
clean, re-seeded database. Migrations are the numbered, checksummed SQL
files under `backend/migrations/` (D-A, FA-F0.5) — there is no migration
rollback tooling in M1; a bad migration is fixed by a new, higher-numbered
file, never by editing or deleting an applied one.

## CI/CD (GitHub Actions)

- **Trigger:** every pull request into `develop`, and every push to
  `develop`/`main` (per the branch model in `CLAUDE.md`).
- **Backend job:** `uv sync` → `ruff check` → `mypy src/` → `pytest -x -q
  --cov=src` (coverage floor 80%, per `.claude/skills/code-gen/SKILL.md`).
- **Frontend job:** `npm ci` → `eslint` → `tsc --noEmit` → `vitest run` →
  `playwright test` against the Compose-started stack.
- **Architecture job:** the layering test, the float-money static scan, and
  the policy-immutability test (E1-S4, E4-S1) run as their own CI step so a
  violation is reported distinctly from a functional test failure.
- No deploy step exists in M1 — CI's job is verification, not release, per
  SG-6.

## Rollback

There is no running production environment to roll back (SG-6). Locally,
`docker compose down -v && ./init.sh` returns to a clean, re-seeded state.
A policy version is never rolled back (SG-10); a correction is a new,
higher-numbered version.

## Observability

`observability.enabled` is `true`. `GET /metrics` exposes RED metrics
(`method`, `route`, `status` labels) and the runtime SLO
(`error_rate_pct: 1`, `p95_ms: 500`) is the ratchet the evaluator checks
read endpoints against. JSON access logs (E1-S3) carry the same
`correlation_id` as the metrics and audit rows, so a Compose log tail is
enough to trace a request end to end without a separate tracing backend —
appropriate for a local demo, not a claim of production-grade observability.
