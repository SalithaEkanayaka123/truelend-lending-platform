# API contracts — TrueLend M1 (E1–E4)

Base path `/api`; `GET /health` is the one exception. All requests/responses
are JSON. Auth is a bearer JWT (D-G) sent as `Authorization: Bearer <token>`.
Every route below declares the auth dependency except `POST /api/auth/login`
and `GET /health` (E1-S1-AC5). Money fields are strings with exactly 2
decimals (D-F). IDs are integers; timestamps are UTC ISO-8601 with `Z`.

## Conventions

- **Error envelope:** `{"error": {"code": "...", "message": "...", "correlation_id": "..."}}`.
  Common codes: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
  `VALIDATION_ERROR` (422). Named 409 codes are listed per endpoint.
- **Ownership:** a customer reading or acting on another customer's
  application returns `404`, never `403`.
- **Pagination:** `limit` (default 20, max 100) and `offset` (default 0);
  list bodies are `{items, total, limit, offset}`.
- **Correlation:** every response carries `X-Correlation-ID`, echoing the
  inbound header when it matches `^[A-Za-z0-9-]{8,64}$`, otherwise a new
  UUID4.

## Auth and platform (E1)

### `POST /api/auth/login` — public
Request: `{email: string, password: string}`
200: `{access_token: string, token_type: "bearer", expires_in: 1800, role: Role}`
401 `UNAUTHENTICATED`: identical body whether the email exists or not.

### `GET /api/auth/me` — any authenticated role
200: `{user_id: int, email: string, role: Role}`
401 `UNAUTHENTICATED`: missing or expired (>1800s) token.

### `GET /health` — public
200: `{"status": "ok"}`, at most 1000ms after the process reports ready.

### `GET /api/audit` — ADMIN only
Query: `entity_type?`, `entity_id?`, `action?` (all optional filters).
200: `{items: AuditEntry[], total, limit, offset}`, ascending by `id`.
403 `FORBIDDEN`: any non-ADMIN role.

## Catalog and policy (E2-S1, E4-S1)

### `GET /api/products` — any authenticated role
200: `ProductRule[]` for the active (highest-numbered APPROVED) policy
version — exactly `PERSONAL`, `VEHICLE`, `EDUCATION`.
401 `UNAUTHENTICATED`: no token.

### `GET /api/policies` — POLICY_EDITOR, ADMIN
200: `{items: PolicyVersion[], total, limit, offset}`.

### `GET /api/policies/{version}` — POLICY_EDITOR, ADMIN
200: `PolicyFile` content plus its `PolicyVersion` metadata.
404 `NOT_FOUND`: no such version.

### `POST /api/policies` — POLICY_EDITOR, ADMIN
Request: `{base_version: int, changes: {PERSONAL?: Partial<ProductRule>, VEHICLE?: ..., EDUCATION?: ...}}`
201: `PolicyVersion` (new, `status: "DRAFT"`); writes `policy_v000N.json`.
422 `VALIDATION_ERROR`: a threshold violates FA-F1.6 (naming the offending
field) — no file is written.

### `POST /api/policies/{version}/approve` — ADMIN only
200: `PolicyVersion` with `status: "APPROVED"`, `approved_by`, `approved_at`.
403 `FORBIDDEN`: POLICY_EDITOR (or lower) attempts approval.
404 `NOT_FOUND`: no such version.

No `PUT`, `PATCH` or `DELETE` route exists on `/api/policies*`; those verbs
return `405 Method Not Allowed` (FastAPI's default for an unregistered
method on a registered path). A raw SQL `UPDATE`/`DELETE` against an
`APPROVED` row aborts at the database via the D-A trigger.

## Applications and documents (E2-S2, E2-S3, E3-S1)

### `POST /api/applications` — CUSTOMER only
Request: `{product_type, requested_amount, tenure_months, age_years, monthly_income, credit_flags, pan, aadhaar}`
201: `Application` (`status: "DRAFT"`, checklist `MISSING` for every
required document of `product_type`).
422 `VALIDATION_ERROR`: `TENURE_OUT_OF_RANGE`, `AMOUNT_OUT_OF_RANGE`, or a
PAN/Aadhaar format error, each naming the field.

### `GET /api/applications/{id}` — owner, UNDERWRITER, ADMIN
200: `Application` including `decision`/`resolution` once present.
404 `NOT_FOUND`: not the owner and not staff.

### `POST /api/applications/{id}/documents` — owner only
Request: `{type: DocumentType, filename: string}`
201: `Document` (`status: "UPLOADED"`); no file content is accepted or
stored. Re-uploading a `REJECTED` document resets it to `UPLOADED`.
422 `DOCUMENT_TYPE_NOT_REQUIRED`: `type` is not in this application's
checklist.

### `POST /api/applications/{id}/submit` — owner only
200: `Application` (`status: "SUBMITTED"`, `policy_version` pinned to the
current active version, `submitted_at` set).
409 `MISSING_DOCUMENTS`: `{missing: DocumentType[]}`, status stays `DRAFT`.
409 `ALREADY_SUBMITTED`: submit called a second time.

### `GET /api/verification-queue` — UNDERWRITER only
Query: `limit`, `offset`.
200: `{items: VerificationQueueItem[], total, limit, offset}`, `UPLOADED`
documents oldest-uploaded first.
403 `FORBIDDEN`: non-UNDERWRITER role.

### `POST /api/documents/{id}/verify` — UNDERWRITER only
Request: `{outcome: "VERIFIED" | "REJECTED", reason: string (1-500 chars)}`
200: `Document` (`status` set; `verified_by`, `verified_at` on `VERIFIED`).
422 `VALIDATION_ERROR`: missing, empty, or >500-char `reason`.
409 `ALREADY_VERIFIED`: the document is already `VERIFIED` (final).

## Underwriting, review, override (E3-S2, E3-S3, E3-S4, E3-S5)

### `POST /api/applications/{id}/underwrite` — owner, UNDERWRITER, ADMIN
200: `{decision, score, reason_codes, policy_version, status}`.
409 `NOT_SUBMITTED`: application is still `DRAFT`.
409 `ALREADY_DECIDED`: underwrite was already called; stored decision is
unchanged.

Rule order (FA-F3.3): income floor (raises `PolicyViolationException` /
`INCOME_BELOW_MIN`, persisted as `AUTO_REJECT`, returned as `200` not an
error) → age range → score thresholds. Status mapping: `AUTO_APPROVE` →
`APPROVED`, `AUTO_REJECT` → `REJECTED`, `MANUAL_REVIEW` → `MANUAL_REVIEW`.
An `ApplicationApproved` event is published in the same transaction on any
transition to `APPROVED` (no M1 subscriber).

### `POST /api/applications/{id}/review` — UNDERWRITER only
Request: `{outcome: "APPROVE" | "REJECT", reason: string (1-500 chars)}`
200: `Application` with `resolution` set (`kind: "MANUAL_REVIEW"`).
403 `FORBIDDEN`: non-UNDERWRITER.
409 `NOT_IN_REVIEW`: application is not `MANUAL_REVIEW`.
422 `VALIDATION_ERROR`: missing/empty/too-long `reason`.
Audit: `REVIEW_APPROVED` or `REVIEW_REJECTED`.

### `POST /api/applications/{id}/override` — UNDERWRITER, ADMIN
Request: `{reason_code: string (one of the policy's override_reason_codes), comment: string (1-500 chars)}`
200: `Application` with `resolution` set (`kind: "OVERRIDE"`, `status:
"APPROVED"`); the original `decisions` row is unchanged.
403 `FORBIDDEN`: CUSTOMER.
409 `NOT_OVERRIDABLE`: decision is not `AUTO_REJECT`, or it already has a
resolution.
422 `VALIDATION_ERROR`: `reason_code` not in the policy's
`override_reason_codes`, or empty `comment`.
Audit: `DECISION_OVERRIDDEN` with `before`/`after` status, `reason_code`,
`comment`.

## Access matrix (FA-F0.3)

| Route | CUSTOMER | UNDERWRITER | POLICY_EDITOR | ADMIN |
|---|---|---|---|---|
| `POST /api/applications`, `.../documents`, `.../submit` | owner only | — | — | — |
| `GET /api/applications/{id}` | owner | ✓ | — | ✓ |
| `POST .../underwrite` | owner | ✓ | — | ✓ |
| `GET /api/verification-queue`, `POST /api/documents/{id}/verify` | — | ✓ | — | — |
| `POST .../review` | — | ✓ | — | — |
| `POST .../override` | — | ✓ | — | ✓ |
| `GET /api/products` | ✓ | ✓ | ✓ | ✓ |
| `GET/POST /api/policies*` (create) | — | — | ✓ | ✓ |
| `POST /api/policies/{v}/approve` | — | — | — | ✓ |
| `GET /api/audit` | — | — | — | ✓ |
