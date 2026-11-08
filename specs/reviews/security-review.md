# Security Review — TrueLend (BC-003) — 2026-11-08

Scope: `git diff main..HEAD` on `feat/sprint-1`, production change set only
(`backend/src/truelend/**`, `frontend/src/**`, `backend/pyproject.toml`,
`frontend/package.json`) plus the deploy/CI files the diff touches
(`init.sh`, `.github/workflows/*.yml`, `frontend/vite.config.ts`). The whole
app is new in this range (186 production files, +13332 lines), so every file
listed in the change set was read in full. Harness/scaffold files under
`.claude/**` are not application code and were read only as references
(`.claude/claude-security-guidance.md`, `gate/references/security-python.md`,
`gate/references/security-react-typescript.md`).

Risk triggers from the context pack were all covered: auth/authz
(`api/deps.py`, `api/auth_router.py`, `service/auth_service.py`), uploads
(`api/documents_router.py`, `service/document_service.py`), persistence and
migrations (`config/db.py`, `repository/*`), API routes and middleware
(`api/*`), PII logging (`config/logging.py`, every `_logger` call site),
`_test` routes (F005), upload log event (F013), and secrets.

## Summary
- BLOCK findings: 0
- WARN findings: 8
- INFO findings: 8
- Overall verdict: WARN (gate PASS — no critical/high finding)

## Verified fixes and confirmed mitigations

- **F005 / QA-VM-005 — fixed.** Both `TRUELEND_ENV=test` fixture routes are
  now double-gated: they are registered only when `settings.env == "test"`
  and each declares `Depends(require_roles("ADMIN"))`
  (`backend/src/truelend/api/main.py:118-131`, `:166-183`). No other
  env-conditional route exists.
- **F013 — fixed.** The upload event logs `application_id`, `document_id`
  and `document_type` only; the filename is never passed to the logger
  (`backend/src/truelend/service/document_service.py:53-62`).
- **SQL injection — none found.** Every statement in `repository/*` and
  `config/db.py` uses bound `?` parameters. The f-strings in those modules
  interpolate only module-level column-name constants and generated `?`
  placeholder lists (`users_repo.py:39-42`), and the dynamic `WHERE` in
  `audit_repo.py:100-115` is assembled from fixed clause literals with the
  values bound. `executescript` (`config/db.py:80`) runs only
  checksum-verified migration files from `migrations_dir`, never request data.
- **Authorization — consistently enforced.** Every route except `GET /health`
  and `POST /api/auth/login` declares `get_current_principal` or
  `require_roles(...)`. CUSTOMER ownership is re-checked server-side on every
  object read/write path (`application_service.get_for_owner`,
  `underwriting_service._load_authorized`,
  `review_service.get_decision_detail`); the role comes from the DB row for
  the token subject, never from a client field or the token payload
  (`auth_service.resolve_principal`). No IDOR found.
- **JWT handling.** Signature is always recomputed as HMAC-SHA256 over the
  token's own segments, so the `alg` header is never trusted (no alg-confusion
  / `alg:none` bypass), the comparison uses `hmac.compare_digest`, and `exp`
  is enforced (`service/auth_service.py:101-113`).
- **PII logging.** `config/logging.py` installs a `RedactionFilter` that
  scrubs PAN, Aadhaar (spaced and plain) and document filenames from both the
  message and `extra={"fields": ...}` before any handler sees the record, and
  redacts embedded tracebacks. Access logging records method/path/status/
  duration/correlation-id only — no query string, no request or response body
  (`api/middleware.py:60-69`).
- **Path traversal.** Policy files are resolved and confined to
  `policies_dir` on every read, not just at startup
  (`service/policy_service.py:72-108`). No request input reaches `open`/`Path`.
- **Uploads.** No file content is accepted or stored — only checklist
  metadata — so there is no upload sink for traversal, content-type abuse or
  malware storage.
- **Frontend XSS / secrets.** No `dangerouslySetInnerHTML`, `innerHTML`,
  `eval`, `new Function`, `target="_blank"`, `postMessage`, or `VITE_*` secret
  anywhere in `frontend/src`. The bearer token is held in a module-level
  variable in `repository/apiClient.ts` (in memory, never persisted to
  `localStorage`/`sessionStorage`, never logged); the only `localStorage` use
  stores integer application ids (`repository/applicationIdsStore.ts`), and
  the backend still re-checks ownership for each id.
- **CSRF.** Not applicable: auth is an `Authorization: Bearer` header, not a
  cookie, and the API accepts only JSON bodies.
- **Unsafe deserialization / dynamic execution / SSRF / command injection.**
  No `pickle`, `yaml.load`, `eval`, `exec`, `subprocess`, `os.system`,
  `requests`/`httpx`, or outbound fetch of a user-supplied URL in the
  backend change set.

## Adversarial verification of the two candidate BLOCK findings

Both candidates were refuted down to WARN; the evidence is recorded here
because each is a **release blocker before any real deployment**, even though
neither is exploitable on a surface that exists in this sprint.

1. **Default JWT signing secret (candidate: high).** Exploit path considered:
   `TRUELEND_JWT_SECRET` unset → `Settings.from_env` falls back to the
   repo-committed literal → an attacker signs
   `{"sub":1,"role":"ADMIN","exp":…}` → `resolve_principal` accepts it and
   loads seeded user 1 (ADMIN) → full admin access. Refutation: no deployed
   surface exists in this range — `.github/workflows/deploy.yml` is a
   manual-dispatch placeholder that exits 1, there is no `docker-compose.yml`
   and no `.env.example`, and `specs/design/deployment.md` documents the
   default as the intentional no-Docker dev fallback with the real value
   sourced from a git-ignored `.env`. The exploit therefore requires a future
   misconfiguration rather than a mitigation bypass, so it is a WARN
   (VULN-001) with a one-line startup guard as the fix, not a build failure.
2. **Hardcoded shared demo password seeded in every environment (candidate:
   high).** Exploit path considered: `seed_users` runs unconditionally in the
   app lifespan, creating `admin@example.test` with a password published in
   `config/db.py` and `README.md` → anyone who can reach an instance logs in
   as ADMIN. Refutation: the seeded synthetic accounts are a specified
   acceptance criterion (`specs/features/F0-platform.md:44` — "demo passwords
   come from the seed script and README"), the project mandates synthetic
   data only, and no instance is deployed. Intentional, spec-sanctioned demo
   behaviour on no live surface → WARN (VULN-002).

Every other candidate finding was medium or lower on its own merits; none
were dropped as refuted beyond the two above.

## BLOCK Findings

None.

## WARN Findings

### [VULN-001] Insecure default JWT signing secret, with no production guard
File: `backend/src/truelend/config/settings.py:18` (default), `:44` (fallback)
Severity: medium (WARN) — release blocker before any deployment
Description: The HS256 signing key falls back to a literal committed to the
repository whenever `TRUELEND_JWT_SECRET` is absent. Nothing refuses or even
warns about the default when `TRUELEND_ENV` is not a dev/test value, so a
deployment that forgets the variable boots happily while accepting tokens any
reader of the repo can forge (subject 1 is the seeded ADMIN). See the
refutation above for why this is not scored as a BLOCK today.
Fix: In `Settings.from_env` (or an app-startup check), raise when the
resolved secret equals the built-in default and `env` is not `dev`/`test`,
and require a minimum key length; keep the default usable only for local dev.

### [VULN-002] Hardcoded shared demo password seeded in every environment
File: `backend/src/truelend/config/db.py:21` (literal), `:104-113` (seeding);
invoked unconditionally at `backend/src/truelend/api/main.py:62`
Severity: medium (WARN) — release blocker before any deployment
Description: One hardcoded password is assigned to all five seeded accounts,
including ADMIN and POLICY_EDITOR, and the seed runs on every startup for
every value of `TRUELEND_ENV`. The same literal appears in `README.md:26` and
in the e2e helpers, so the credential is public. Spec-sanctioned for the
synthetic demo (see refutation), but there is no environment gate that would
stop it from reaching a shared or internet-exposed instance.
Fix: Skip seeding (or take the password from `TRUELEND_SEED_PASSWORD`, with
distinct per-account values) whenever `env` is not `dev`/`test`; alternatively
force a password change on first login for the privileged accounts.

### [VULN-003] No rate limiting, throttling or lockout on login
File: `backend/src/truelend/api/auth_router.py:40-57`
Severity: medium (WARN)
Description: `POST /api/auth/login` has no per-IP or per-account throttle,
no backoff and no lockout, and the seeded account emails are documented, so
an unauthenticated attacker can mount unlimited online password guessing.
scrypt (N=2^14) raises the per-attempt cost, which is the only brake — and it
makes the same endpoint an easy CPU-exhaustion lever against the SLO
(`p95_ms:500`). No other state-changing endpoint is throttled either.
Fix: Add per-IP and per-email rate limiting with exponential backoff on the
login route (middleware or a small in-process limiter is enough at demo
scale), plus a temporary lockout counter persisted with the user row.

### [VULN-004] OpenAPI schema and Swagger/ReDoc UI served unauthenticated
File: `backend/src/truelend/api/main.py:189`
Severity: medium (WARN)
Description: `FastAPI(lifespan=_lifespan)` keeps the framework defaults, so
`/openapi.json`, `/docs` and `/redoc` are world-readable and publish the full
route table, request schemas, role model and error codes to anonymous
callers. The fixture routes are excluded via `include_in_schema=False`, but
every real endpoint is disclosed.
Fix: Pass `docs_url=None, redoc_url=None, openapi_url=None` unless
`env` is `dev`/`test`, or place the docs routes behind
`Depends(require_roles("ADMIN"))`.

### [VULN-005] No security response headers
File: `backend/src/truelend/api/middleware.py:41-50` (only `X-Correlation-ID`
is set); no header middleware registered in `backend/src/truelend/api/main.py:201`
Severity: medium (WARN)
Description: Responses carry no `Content-Security-Policy`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`,
`Referrer-Policy` or HSTS. This matters today because the same origin serves
HTML (the Swagger UI of VULN-004) and will matter more when the SPA is served
from the backend origin: there is no defence-in-depth layer behind React's
auto-escaping, and JSON error bodies can be sniffed/framed.
Fix: Add a small response-header middleware setting `nosniff`,
`X-Frame-Options: DENY`, a restrictive `Content-Security-Policy` (and HSTS
when served over TLS); keep it ahead of the correlation-id middleware.

### [VULN-006] Critical/high npm advisories in the frontend toolchain
File: `frontend/package.json:27` (`@vitest/coverage-v8`), `:33` (`vite`),
`:34` (`vitest`)
Severity: medium (WARN)
Description: `npm audit` reports 3 critical and 1 high advisory (18 total):
Tinypool prototype-pollution-to-RCE via worker options, Vitest arbitrary file
read/code execution via `@vitest/mocker` and the UI server, Vite path
traversal / `server.fs.deny` bypass / cross-origin script execution through
custom middleware, and the esbuild dev-server request issue. All sit in
`devDependencies`, so no production runtime path is exposed — the risk is to
developer and CI machines (a malicious page reaching the dev server, or a
poisoned test fixture). Fixes are breaking majors (`vite@8`, `vitest@5`),
which is why this is WARN and not BLOCK.
Fix: Plan the `vite`/`vitest`/`@vitest/coverage-v8` major upgrade in the next
sprint, re-run `npm audit` in CI, and until then do not expose the Vite dev
server or the Vitest UI beyond localhost.

### [VULN-007] Policy numeric fields accepted as unvalidated decimal strings
File: `backend/src/truelend/api/policies_router.py:34-42`
(`min_income`, `min_amount`, `max_amount`, `annual_rate_pct` typed as bare
`str`), consumed at `backend/src/truelend/service/policy_service.py:277-279`
and `:264`
Severity: medium (WARN)
Description: A POLICY_EDITOR/ADMIN patch value goes straight into `Decimal(...)`
with no pattern constraint. A non-numeric string raises `InvalidOperation`,
which is not a `DomainError` and so surfaces as an unhandled 500. Worse,
`"NaN"`/`"sNaN"`/`"Infinity"` parse successfully and silently pass
`Decimal(value) < 0` and the min/max comparisons (all NaN comparisons are
false), so a NaN threshold can be written into a policy file and later
approved — after which the underwriting range checks on that product compare
against NaN and stop behaving as the policy intends. Authenticated privileged
input, which is why this is medium rather than high.
Fix: Give those fields the same money pattern the apply route uses
(`^[0-9]+\.[0-9]{2}$` via `Field(pattern=...)`), and in
`_require_non_negative` reject non-finite values explicitly
(`Decimal.is_finite()`), mapping parse failures to `PolicyFieldValidationError`.

### [VULN-008] Raw PAN/Aadhaar persisted unencrypted with no at-rest control
File: `backend/src/truelend/repository/applications_repo.py:20-31` (columns),
`:58-87` (insert)
Severity: medium (WARN)
Description: National identifiers are stored in cleartext in the SQLite file,
with no column encryption, no retention/erasure path and no key management.
Compensating controls are real and were verified — masked on every read
(`application_service._mask_pan`/`_mask_aadhaar`), never returned raw by any
route, never logged, and the project mandates synthetic data only — so the
current exposure is limited to the demo DB file. The gap is structural: any
process or backup that can read the file reads the identifiers.
Fix: Before any non-synthetic data, encrypt the `pan`/`aadhaar` columns with a
key from the environment/secret manager (or store a keyed hash plus the
last-4 needed for display), restrict the DB file mode, and document retention.

## INFO Findings

### [VULN-009] Password hash compared with `==` instead of a constant-time function
File: `backend/src/truelend/config/db.py:53`
Severity: low (INFO)
Description: `verify_password` ends with `derived.hex() == hash_hex`. The
compared values are scrypt outputs, not secrets the attacker can grind
against, so the practical leak is negligible — but the comparison is
early-exit and the login path already takes care to be timing-flat
(`auth_service._DUMMY_HASH`), so this is inconsistent with its own threat model.
Fix: Use `hmac.compare_digest(derived.hex(), hash_hex)`.

### [VULN-010] Internal filesystem path echoed to the client in a 500 body
File: `backend/src/truelend/types/errors.py:150-155`, surfaced by
`backend/src/truelend/config/errors.py:23` and
`backend/src/truelend/api/main.py:90-95`
Severity: low (INFO)
Description: `PolicyPathTraversalError` is mapped to HTTP 500 but, unlike the
generic handler, the `DomainError` handler returns `str(exc)` — which embeds
the absolute policy file path — in the response envelope. Same shape for
`POLICY_CHECKSUM_MISMATCH` (discloses version/state). Minor server-detail
disclosure to an authenticated caller.
Fix: For 5xx-mapped domain errors, return the generic
"An unexpected error occurred." message and keep the detailed text in the
(already redacted) log line only.

### [VULN-011] ADMIN-gated fixture route can write arbitrary audit rows
File: `backend/src/truelend/api/main.py:166-183`
Severity: low (INFO)
Description: `/api/_test/audited-action` writes a caller-chosen
`action`/`entity_type`/`entity_id` into the append-only audit log. F005 fixed
the authz gap (ADMIN only) and the route is mounted only when
`TRUELEND_ENV=test`, so this is residual: audit-trail integrity now depends
on that env value never being `test` outside the test/e2e harness.
Fix: Additionally require a non-production build marker, or move the fixture
into the test harness so the production app factory cannot register it at all.

### [VULN-012] No token revocation or server-side logout
File: `backend/src/truelend/service/auth_service.py:88-98`;
`frontend/src/repository/apiClient.ts:25-27`
Severity: low (INFO)
Description: Tokens are stateless with a 1800 s lifetime and no deny-list or
`jti`; logout only clears the in-memory client token, so a stolen or
copy-pasted token stays valid for the rest of its window, and a role change or
account disable is not honoured until expiry (only deletion is, via the
subject lookup).
Fix: If stronger revocation is needed, add a token version/`jti` column
checked in `resolve_principal`, or shorten the lifetime with refresh.

### [VULN-013] Upload filename has no maximum length
File: `backend/src/truelend/api/applications_router.py:59`
Severity: low (INFO)
Description: `filename: str = Field(min_length=1)` has no upper bound, so an
owner can persist an arbitrarily large string into
`application_documents.filename`, which is then returned to the verification
UI. No injection results (the value is never logged, never used in a path, and
React escapes it), but it is unbounded storage and render input.
Fix: Add `max_length=255` and, optionally, a conservative filename pattern.

### [VULN-014] CORS not configured — must stay an allowlist when the SPA moves cross-origin
File: `backend/src/truelend/api/main.py:193-201`; dev proxy at
`frontend/vite.config.ts:6-13`
Severity: low (INFO)
Description: There is no `CORSMiddleware` today, which is the safe state: the
SPA calls relative `/api` paths through the Vite dev proxy. Recording it so
the deployment story does not reach for `allow_origins=["*"]` later.
Fix: When the frontend is served from another origin, add CORS with an
explicit origin allowlist from configuration, `allow_credentials` only if
needed, and no wildcard.

### [VULN-015] Test and e2e fixtures embed the demo credential
File: `backend/tests/conftest.py:15`, `backend/tests/api/*` (import
`DEMO_PASSWORD`), `e2e/support/roles.ts:20`,
`e2e/policy-editor.spec.ts:4`, `frontend/src/ui/pages/LoginPage.test.tsx:24`
Severity: low (INFO)
Description: Expected for fixtures and not a finding in itself; logged only
because the same literal is the production seed credential tracked as
VULN-002. Once VULN-002 is environment-gated, these must read the value from
the test environment rather than from `config.db`.
Fix: After VULN-002, have fixtures source the password from an env var set by
the test harness.

### [VULN-016] `assert` used for runtime invariants inside request handlers
File: `backend/src/truelend/api/main.py:92`, `:99`, `:105`;
`backend/src/truelend/service/underwriting_service.py:105`, `:131`;
`backend/src/truelend/service/policy_service.py:214`, `:243`
Severity: low (INFO)
Description: None of these asserts guard authorization (authz is
`require_roles`/ownership checks), so there is no `python -O` auth bypass. But
running with `-O` strips them, turning e.g. "policy_version is pinned" from a
loud failure into an unchecked `None` flowing into the decision path.
Fix: Replace the request-path asserts with explicit raises of the appropriate
domain error, or document that `-O` is unsupported.
