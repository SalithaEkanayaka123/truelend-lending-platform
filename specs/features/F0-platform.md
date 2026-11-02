# F0 — Platform: Auth, Audit, JSON Logs, Health

- **Feature / epic:** F0 / E0 · **Sprint:** 1 · **Parent:** `specs/app_spec.md`
- **Covers:** NFR-03, NFR-04, NFR-05 (database migrations), NFR-06, NFR-07, NFR-08 (layering test); D-09, D-10; NFR-01 float guard
- **Depends on:** nothing. Every other feature depends on F0's auth guard, audit writer and error envelope.
- **Story points and INVEST** are assigned when `/spec` renders these stories; they are not set here.

## Shared conventions (all features follow these)

- **Base path** `/api`; health is `GET /health` (matches `evaluation.health_check` in the manifest).
- **IDs** are integers. **Timestamps** are UTC ISO-8601 with `Z`. **Dates** are `YYYY-MM-DD`.
- **Money** is INR, a string with exactly 2 decimals on the wire (`"100000.00"`); stored as text or integer paise, never REAL (FA-F0.1).
- **Error envelope:** `{"error":{"code":"…","message":"…","correlation_id":"…"}}`. Codes used: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_ERROR` 422, plus named 409 codes per feature.
- **Pagination:** `limit` (default 20, max 100) and `offset` (default 0); list bodies are `{items, total, limit, offset}`.
- **Ownership:** a customer reading another customer's resource gets `404`, not `403` (FA-F0.6).
- **Ready state:** the process is ready when migrations and seeds have finished.

## Settled assumptions

| ID | Settles | Assumption |
|----|---------|------------|
| FA-F0.1 | NFR-01 | Money is a `Decimal` in code, text or integer paise in SQLite, and a string in JSON. A static scan fails the build on `float` use in money code. |
| FA-F0.2 | NFR-04 | Auth is a bearer JWT (HS256), 1800 s lifetime, signed with the secret in env `TRUELEND_JWT_SECRET`. Login is by email and password; passwords are stored salted-hashed. The guard is a router-level dependency, so it sits at the controller layer. |
| FA-F0.3 | NFR-04 | Roles are `CUSTOMER`, `UNDERWRITER`, `POLICY_EDITOR`, `ADMIN`. The System scheduler is a job endpoint guarded as `ADMIN`. Per-role access follows the matrix below. |
| FA-F0.4 | NFR-04 | Audited actions (exactly nine): `POLICY_CREATED`, `POLICY_APPROVED`, `DOCUMENT_VERIFIED`, `DOCUMENT_REJECTED`, `REVIEW_APPROVED`, `REVIEW_REJECTED`, `DECISION_OVERRIDDEN`, `DISBURSEMENT_RECORDED`, `EOD_RUN`. Customer actions and automated decisions are not audited. |
| FA-F0.5 | NFR-05 | Migrations are numbered SQL files `backend/migrations/NNNN_name.sql`, applied in order and recorded in `schema_migrations` with a SHA-256. A changed or missing applied file stops startup. |
| FA-F0.6 | NFR-03 | Request and response bodies are never logged. A redaction filter masks PAN (`[A-Z]{5}[0-9]{4}[A-Z]`) and Aadhaar (12 digits, optionally spaced as 4-4-4) anywhere in a log record. Document filenames and contents are never logged; only document IDs are. |
| FA-F0.7 | NFR-06 | Correlation ID comes from inbound `X-Correlation-ID` if it matches `^[A-Za-z0-9-]{8,64}$`, otherwise a new UUID4. It is echoed in the response header and is on every log line and audit row. |
| FA-F0.8 | NFR-07 | The 1-second limit runs from "ready" to the `GET /health` response, measured in-process. |
| FA-F0.9 | NFR-02/05 | Append-only is enforced twice: no update/delete code path, and SQLite triggers that abort `UPDATE`/`DELETE` on `audit_log` and `schedule_rows` (F4). |

**Permission matrix** (✓ = allowed; everything else is `403`):

| Capability | CUSTOMER | UNDERWRITER | POLICY_EDITOR | ADMIN |
|---|---|---|---|---|
| Own applications / loans | ✓ | | | |
| Verification queue, verify documents, manual review | | ✓ | | |
| Override AUTO_REJECT | | ✓ | | ✓ |
| Create policy version | | | ✓ | ✓ |
| Approve policy, run EOD, dashboard, audit read | | | | ✓ |
| Disburse | | ✓ | | ✓ |
| List all applications | | ✓ | | ✓ |

**Seed users** (synthetic; demo passwords come from the seed script and README, not this spec): 1 `admin@example.test` ADMIN, 2 `policy@example.test` POLICY_EDITOR, 3 `underwriter@example.test` UNDERWRITER, 4 `customer1@example.test` CUSTOMER, 5 `customer2@example.test` CUSTOMER.

## Entities

| Entity | Fields |
|---|---|
| `users` | id, email (unique), password_hash, role, display_name, active |
| `audit_log` | id, occurred_at, actor_user_id, actor_role, action, entity_type, entity_id, correlation_id, reason_code?, comment?, before (JSON)?, after (JSON)? |
| `schema_migrations` | filename (PK), sha256, applied_at |

## Endpoints

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | `{email, password}` → `{access_token, token_type:"bearer", expires_in:1800, role}` |
| GET | `/api/auth/me` | any role | `{user_id, email, role}` |
| GET | `/api/audit` | ADMIN | filters `entity_type`, `entity_id`, `action`; ordered by id ascending |
| GET | `/health` | public | `200 {"status":"ok"}` |

## Stories

### E0-S1 — Authentication and role guard (layer: API)
Depends on: none. Traces: NFR-04.
- **E0-S1-AC1** — *Given* seeded user `customer1@example.test` with the correct password, *when* they POST `/api/auth/login`, *then* the response is 200 with `expires_in` 1800 and `role` `CUSTOMER`.
- **E0-S1-AC2** — *Given* a wrong password, *when* they POST `/api/auth/login`, *then* it is 401 `UNAUTHENTICATED` with no token and the same body whether or not the email exists.
- **E0-S1-AC3** — *Given* no `Authorization` header, or a token 1801 s old, *when* they GET `/api/auth/me`, *then* it is 401.
- **E0-S1-AC4** — *Given* a CUSTOMER token, *when* they GET `/api/audit`, *then* it is 403 `FORBIDDEN`.
- **E0-S1-AC5** — *Given* the registered route table, *when* it is enumerated, *then* every route except `POST /api/auth/login` and `GET /health` declares the auth dependency.

### E0-S2 — Audit trail (layer: Repository)
Depends on: E0-S1 (contract: auth principal). Traces: NFR-04, NFR-02.
- **E0-S2-AC1** — *Given* UNDERWRITER user 3 performing an audited action on application 7, *when* it succeeds, *then* one `audit_log` row has `actor_user_id` 3, `actor_role` `UNDERWRITER`, `entity_type` `application`, `entity_id` 7, a UTC `occurred_at`, and `correlation_id` equal to the response header.
- **E0-S2-AC2** — *Given* an existing audit row, *when* any `UPDATE` or `DELETE` runs on `audit_log`, *then* the database aborts and the row is unchanged.
- **E0-S2-AC3** — *Given* 3 audit rows for application 7 and 2 for application 8, *when* ADMIN GETs `/api/audit?entity_type=application&entity_id=7`, *then* exactly 3 rows return in ascending id order.
- **E0-S2-AC4** — *Given* an audited action that fails with a 409, *when* the request ends, *then* no audit row exists for it (the audit write shares the action's transaction).

### E0-S3 — JSON logs, correlation IDs, redaction (layer: Config)
Depends on: none. Traces: NFR-06, NFR-03.
- **E0-S3-AC1** — *Given* any completed request, *when* output is captured, *then* exactly one JSON log line has the keys `ts`, `level`, `event`, `correlation_id`, `method`, `path`, `status`, `duration_ms`.
- **E0-S3-AC2** — *Given* no inbound `X-Correlation-ID`, *then* the response header is a UUID4 equal to the log's `correlation_id`; *given* inbound `req-12345678`, *then* it is reused; *given* inbound `a b!`, *then* it is replaced by a UUID4.
- **E0-S3-AC3** — *Given* an application created with PAN `ABCDE1234F` and Aadhaar `1234 5678 9012`, *when* all captured logs (including error paths) are scanned, *then* neither `ABCDE1234F`, `123456789012` nor `1234 5678 9012` appears.
- **E0-S3-AC4** — *Given* a document upload with filename `salary_slip_jan.pdf`, *when* logs are scanned, *then* the document ID appears and the filename does not.
- **E0-S3-AC5** — *Given* an unhandled exception, *when* it propagates, *then* the response is 500 with the error envelope and no stack trace, and the trace is logged as JSON through the redaction filter.

### E0-S4 — Health, migrations, architecture guards (layer: Config)
Depends on: none. Traces: NFR-05, NFR-07, NFR-08, NFR-01, D-09, D-10.
- **E0-S4-AC1** — *Given* the process has reported ready, *when* `GET /health` is requested without a token, *then* it is 200 `{"status":"ok"}` in at most 1000 ms.
- **E0-S4-AC2** — *Given* migrations `0001`–`0003` already applied, *when* the app starts again, *then* none re-run and `schema_migrations` still has 3 rows with SHA-256 values.
- **E0-S4-AC3** — *Given* applied migration `0002` edited on disk, *when* the app starts, *then* startup aborts with `MIGRATION_CHECKSUM_MISMATCH` and `/health` never returns 200.
- **E0-S4-AC4** — *Given* the source tree under `backend/src/truelend` and `frontend/src`, *when* the layer test runs, *then* no module imports from a higher layer in the order types, config, repository, service, api, ui.
- **E0-S4-AC5** — *Given* the money code paths, *when* the static scan runs, *then* it finds no `float` type, `float(` call or `REAL` money column.

## AC-tagged test list

| Test | Level | Tags |
|---|---|---|
| `api/test_auth.py::test_NFR04_login_returns_1800s_token` | API | NFR-04 · E0-S1-AC1 |
| `api/test_auth.py::test_NFR04_wrong_password_is_uniform_401` | API | NFR-04 · E0-S1-AC2 |
| `api/test_auth.py::test_NFR04_missing_or_expired_token_401` | API | NFR-04 · E0-S1-AC3 |
| `api/test_auth.py::test_NFR04_customer_cannot_read_audit` | API | NFR-04 · E0-S1-AC4 |
| `architecture/test_auth_boundary.py::test_NFR04_all_routes_guarded` | Architecture | NFR-04, NFR-08 · E0-S1-AC5 |
| `repo/test_audit.py::test_NFR04_row_has_user_id_and_timestamp` | Integration | NFR-04 · E0-S2-AC1 |
| `repo/test_audit.py::test_NFR02_audit_log_update_delete_abort` | Integration | NFR-02 · E0-S2-AC2 |
| `api/test_audit.py::test_NFR04_filter_by_entity` | API | NFR-04 · E0-S2-AC3 |
| `api/test_audit.py::test_NFR04_failed_action_writes_no_row` | API | NFR-04 · E0-S2-AC4 |
| `api/test_logging.py::test_NFR06_json_line_has_required_keys` | API | NFR-06 · E0-S3-AC1 |
| `api/test_logging.py::test_NFR06_correlation_id_generated_reused_replaced` | API | NFR-06 · E0-S3-AC2 |
| `api/test_logging.py::test_NFR03_pan_aadhaar_never_logged` | API | NFR-03 · E0-S3-AC3 |
| `api/test_logging.py::test_NFR03_filename_never_logged` | API | NFR-03 · E0-S3-AC4 |
| `api/test_logging.py::test_NFR06_500_has_envelope_no_trace` | API | NFR-06 · E0-S3-AC5 |
| `api/test_health.py::test_D10_health_200_within_1s` | API | NFR-07, D-10 · E0-S4-AC1 |
| `repo/test_migrations.py::test_NFR05_applied_migrations_not_rerun` | Integration | NFR-05 · E0-S4-AC2 |
| `repo/test_migrations.py::test_NFR05_checksum_mismatch_aborts_startup` | Integration | NFR-05 · E0-S4-AC3 |
| `architecture/test_layers.py::test_NFR08_no_upward_imports` | Architecture | NFR-08 · E0-S4-AC4 |
| `architecture/test_money.py::test_D09_no_float_in_money_paths` | Architecture | NFR-01, D-09 · E0-S4-AC5 |

## Out of scope for F0

Login UI beyond a minimal sign-in form (visual design is `/design`'s); token refresh; password reset; user administration.
