# Code review — sprint-1 close (`/gate`)

- **Range:** `main..HEAD` on `feat/sprint-1` (186 production files, 13,332 insertions; greenfield, no prior lines to regress)
- **Scope reviewed:** `backend/src/truelend/**` (42 files), `frontend/src/**`, plus `backend/migrations/*.sql` and `backend/policies/policy_v0001.json` as context for the persistence findings. Generated/vendored files, lockfiles and `.claude/**` harness files out of scope.
- **Inputs:** `specs/reviews/review-context-pack.md`, `specs/stories/acceptance-criteria.json` + the 16 sealed story files, `specs/design/program-design.md`, `specs/design/api-contracts.md`, `specs/design/component-map.md`, `specs/design/constitution.md`, `specs/ui_spec.md`, `REVIEW.md`, `.claude/state/learned-rules.md` (empty), `sprint-contracts/{A..G}.json`. Builder transcripts, `claude-progress.txt` and iteration logs were **not** read.
- **Verdict:** **FAIL** — 1 BLOCK, 14 WARN, 8 INFO.

## Method and what was refuted

Mechanical rules were re-run rather than eyeballed, so they are not restated as findings
(`REVIEW.md` explicitly forbids re-litigating sensor-enforced rules):

- Function/file length: ran the project's own gate (`.claude/hooks/lib/length.js` `oversizedFunctions`)
  over all 190 source + test files — **0 oversized functions, 0 oversized files** (largest source file is
  `service/policy_service.py` at 297 lines).
- Money discipline: no `float`, no `float(`, no `REAL` column; money is integer paise in SQLite,
  `Decimal` in Python, and strings end-to-end in the UI (`formatMoney.ts`, `policyValidation.ts`
  use string/`BigInt` arithmetic only). **Clean.**
- Append-only: `audit_log`, `decisions`, `resolutions` carry `RAISE(ABORT)` update/delete triggers;
  `policy_versions` permits only `DRAFT`→`APPROVED`; migrations are checksummed on every start
  (`config/db.py:88-101`). **Clean.**
- PII: `RedactionFilter` strips PAN/Aadhaar/filenames before any handler sees a record; the upload
  event logs ids and type only; no request/response bodies are logged. **Clean.**
- Layering (types → config → repository → service → api → ui): no upward import found; the
  `hash_password` placement in `config/db.py` is documented and consistent with the rule.
- Scoring/underwriting arithmetic was recomputed against E3-S2-AC1..AC5 and E3-S3-AC1..AC6 by hand —
  all match (740 / 680 / 500 / 350 / 790 / cap at 150 income points).

Findings below were each probed against the running app where behaviour was in question. CR-001 is
reported as BLOCK because it was **reproduced end-to-end**, not inferred.

---

## BLOCK

### CR-001 — A customer can un-verify a VERIFIED document by re-uploading after submission
- **File:** `backend/src/truelend/service/document_service.py:44-49` (with `backend/src/truelend/repository/documents_repo.py:40-54`)
- **Severity:** BLOCK · **Confidence:** high · **Axis:** spec

`upload_document` checks only ownership and that the type is on the checklist. It never checks the
application's status, and `documents_repo.mark_uploaded` updates the row regardless of its current
status. So `POST /api/applications/{id}/documents` on an already-submitted application rewrites a
`VERIFIED` document back to `UPLOADED`.

Reproduced against the real app (fresh DB, seeded policy v1, customer1 + underwriter tokens):

```
submit: 200 SUBMITTED
verify doc1: 200 {... 'status': 'VERIFIED', 'verified_by': 3, 'verified_at': '2026-01-01T12:00:00+00:00'}
RE-UPLOAD AFTER SUBMIT: 201
   app status: SUBMITTED | doc1: {'document_id': 1, 'type': 'ID_PROOF', 'status': 'UPLOADED', ...}
queue total: 3  [1, 2, 3]            # the verified document is back in the underwriter's queue
UPLOAD AFTER DECISION: 201 MANUAL_REVIEW   # also accepted after the decision is persisted

# resulting row:
(1, 'UPLOADED', 'swapped.png', '2026-01-01T12:00:00+00:00', 3, '2026-01-01T12:00:00+00:00')
# audit_log: [('DOCUMENT_VERIFIED', 'document', 1)]   <- no row records the regression
```

What this violates:
1. `specs/design/api-contracts.md` (`POST /api/documents/{id}/verify`): "409 `ALREADY_VERIFIED`: the
   document is already `VERIFIED` (**final**)", and E3-S1-AC5, which exists to make verification final.
   The guard on `/verify` is bypassed through `/documents`.
2. `specs/stories/E2-S3.md` Scope **Out:** "editing an application after submission" — this is exactly
   that path, and it is also reachable after a decision has been persisted.
3. The code's own stated invariant: `service/application_service.py:4` claims "SG-8: no
   update-after-submit or delete path exists here", while `document_service` supplies one.
4. NFR-04 / FA-F0.4 audit coverage: the underwriter's `DOCUMENT_VERIFIED` decision is silently undone
   with **no audit row**, and the row is left with `verified_by`/`verified_at` populated while its
   status is `UPLOADED` — persisted state that no reader can interpret correctly.

No upstream guard prevents it: the route (`api/applications_router.py:161-177`) only applies
`require_roles("CUSTOMER")`, and no test in `backend/tests/` exercises upload-after-submit (searched
`test_documents.py`, `test_verification.py`, `test_document_service.py`).

**Fix (minimum):** in `upload_document`, after `get_for_owner`, raise `AlreadySubmittedError` when
`view.status != "DRAFT"`. REJECTED→UPLOADED re-upload (E2-S3-AC1) still works inside DRAFT; the
post-submission re-upload affordance the tracker screen offers is itself out-of-sprint scope (see
CR-008).

---

## WARN

### CR-002 — `mark_uploaded` leaves stale verifier attribution on the reset row
- **File:** `backend/src/truelend/repository/documents_repo.py:50-54` · WARN · high · spec

The UPDATE clears `reason` but not `verified_by`/`verified_at`, so a document reset from REJECTED to
UPLOADED (the AC1 path, legitimate inside DRAFT) keeps the verifier who rejected it attributed to it.
Confirmed in the row dump above.
**Fix:** add `verified_by = NULL, verified_at = NULL` to the `SET` clause.

### CR-003 — UI validator is stricter than the backend: `min_age == max_age` is blocked client-side
- **File:** `frontend/src/service/policyValidation.ts:25` · WARN · high · spec

Frontend requires `min_age < max_age`; the authority (`service/policy_service.py:258`) rejects only
`min_age > max_age`. A policy with `min_age == max_age` is valid server-side but the editor shows an
inline error and disables Save (E4-S2-AC2 path), so a legal policy edit cannot be made at all. The
file's own docstring says it "mirrors" the server rules.
**Fix:** `if (!(rule.min_age <= rule.max_age))`.

### CR-004 — `_correlation_id` duplicated verbatim in four modules
- **File:** `backend/src/truelend/api/main.py:74`, `api/policies_router.py:69`, `api/documents_router.py:88`, `api/review_router.py:71` · WARN · high · standards

Identical two-line helper (`getattr(request.state, "correlation_id", None) or str(uuid4())`) copied
four times, each with its own `uuid4` import. `api/deps.py` is the existing home for shared request
helpers.
**Fix:** move one copy into `api/deps.py` and import it in the four call sites.

### CR-005 — every `sqlite3.DatabaseError` is reported to the client as a domain 409, cause discarded
- **File:** `backend/src/truelend/service/review_service.py:180-182` · WARN · high · spec

```python
except sqlite3.DatabaseError:
    conn.rollback()
    raise conflict from None
```
A `UNIQUE` violation legitimately maps to 409, but `DatabaseError` also covers
`OperationalError` — notably SQLite's "database is locked", which is plausible here because every
request opens its own connection (`api/deps.py:24-36`) with no WAL pragma. In that case the caller is
told `NOT_IN_REVIEW`/`NOT_OVERRIDABLE` (a false statement about domain state), `from None` drops the
traceback, and nothing is logged, so the operator sees no failure at all.
**Fix:** narrow to `sqlite3.IntegrityError`; let other `DatabaseError`s propagate to the existing 500
envelope.

### CR-006 — policy responses omit contract fields (`sha256`, policy file content)
- **File:** `backend/src/truelend/api/policies_router.py:50-59,157-165` · WARN · high · spec

`specs/design/program-design.md:63` defines `PolicyVersion { version, status, sha256, ... }` and
`api-contracts.md:52` defines `GET /api/policies/{version}` as "`PolicyFile` content plus its
`PolicyVersion` metadata". The implementation returns metadata without `sha256` and never returns the
file content. The frontend already pays for it with a compensating optional field and an apology
comment (`frontend/src/types/policy.ts`: "part of the documented `PolicyVersion` schema but the
running backend does not currently return it").
**Fix:** add `sha256` to `PolicyVersionResponse` and the verified file content to the detail route, or
amend `api-contracts.md`/`program-design.md` through the amendment path.

### CR-007 — timestamps are emitted as `+00:00`, not the contracted `Z`
- **File:** `backend/src/truelend/service/document_service.py:47` and every other `clock.now().astimezone(UTC).isoformat()` call site (`application_service.py:76`, `policy_service.py:63,179,231`, `review_service.py:202`, `underwriting_service.py:164`, `verification_service.py:72`, `repository/audit_repo.py:67`, `config/db.py:83`) · WARN · high · spec

`api-contracts.md:7` states "timestamps are UTC ISO-8601 with `Z`". Observed output:
`'2026-01-01T12:00:00+00:00'`. Every timestamp field in every response and audit row diverges. Not a
functional break for JS `Date`, but it is a contract convention applied nowhere.
**Fix:** one shared helper (e.g. `config/money.py`-style `config/time.py::to_wire(dt)`) that emits
`...Z`, used by the nine call sites — or amend the convention.

### CR-008 — out-of-sprint screens shipped: the applicant tracker and "My applications" belong to E5
- **Files:** `frontend/src/ui/pages/TrackPage.tsx`, `frontend/src/ui/pages/MyApplicationsPage.tsx`, `frontend/src/ui/components/ApplicationStepper.tsx`, `frontend/src/repository/applicationIdsStore.ts`, `frontend/src/service/useMyApplications.ts`, `frontend/src/service/useUploadDocument.ts` · WARN · high · spec

`specs/ui_spec.md:46,50` traces S-A-1 ("My applications") to **E5-S1-AC5** and S-A-5 ("Application
tracking") to **E5-S3-AC1..AC5**. Neither story is in sprint 1 (`E1-S1`..`E4-S2`), neither appears in
`sprint-contracts/{A..G}.json`, and no feature in `features.json` covers them. Because the sprint-1
API has no list endpoint, the feature ships a client-side substitute for server state —
`applicationIdsStore.ts` keeps application ids in `localStorage`, justified by a four-line
block-comment ("The API has no 'list my applications' endpoint yet (E5-S1), so ...").
Per the paragraph-workaround rule, a workaround that needs a paragraph of justification is a signal the
code, not the comment, should change; here the correct change is scope, not code.
**Fix:** defer these modules to the E5 sprint (or land an approved design amendment adding the
criteria), rather than carrying unspecified scope plus a client-side state substitute into the sprint-1
merge.

### CR-009 — eight tests cite acceptance criterion `E2-S4-AC4`, which does not exist
- **Files:** `frontend/src/service/useUploadDocument.test.ts:13`, `frontend/src/ui/components/ApplicationLoadError.test.tsx:20`, `frontend/src/ui/components/ApplicationStepper.test.tsx:10,16`, `frontend/src/ui/pages/MyApplicationsPage.test.tsx:44`, `frontend/src/ui/pages/TrackPage.test.tsx:62,73,84` · WARN · high · standards

`E2-S4` has AC1–AC3 only (`specs/stories/acceptance-criteria.json`, `specs/stories/E2-S4.md`). A
repo-wide search finds `E2-S4-AC4` **only** in these eight test names — no story, no amendment, no
feature. Traceability tooling and the AC-trace gate will either silently ignore or mis-attribute them.
**Fix:** retag the eight test names to the criterion that actually governs them (or to the amendment id
created for CR-008).

### CR-010 — response shapes diverge from the contract on two endpoints
- **File:** `backend/src/truelend/api/applications_router.py:161-177,152-158` · WARN · medium · spec

`api-contracts.md:84-89` and `program-design.md:117` specify `POST .../documents` → `Document`; the
route returns the whole `ApplicationResponse`. `api-contracts.md:80` says `GET /api/applications/{id}`
returns "`Application` including `decision`/`resolution` once present"; `ApplicationResponse` has
neither field (the UI fetches `/decision` separately). No current caller breaks — the UI was written
against the implementation — so this is divergence, not an outage.
**Fix:** align the two responses with the contract, or amend the contract so the frontend's shape is
the specified one.

### CR-011 — file ownership and module placement diverge from `program-design.md` / `component-map.md`
- **Files:** `backend/src/truelend/api/documents_router.py:1-2,92-121`, `backend/src/truelend/api/review_router.py`, all of `frontend/src/**` · WARN · medium · standards

`program-design.md:283-285` plans `documents_router.py` (upload/submit) **and**
`verification_router.py` (queue/verify). As shipped, `documents_router.py` contains the *verification*
routes while upload/submit live in `applications_router.py`, and `review_router.py` appears in no map
at all. The frontend layout bears little relation to the planned one (`api/httpClient.ts`,
`queryClient.ts`, `ui/apply/**`, `ui/verification/**` planned; `repository/*Repo.ts`, `service/use*.ts`,
`ui/pages/**` shipped). `specs/reviews/ownership-check.json` fails with 48 unowned files as a direct
result. A file named `documents_router.py` that holds no document-upload route is actively misleading
for future navigation.
**Fix:** amend `component-map.md`/`program-design.md` to the shipped structure (cheapest, surgical), or
rename `documents_router.py` → `verification_router.py`; either way the ownership gate must pass.

### CR-012 — the policy editor parses the backend's human-readable 422 message to locate the bad field
- **File:** `frontend/src/service/usePolicyEditor.ts:21,45-52,88-95` · WARN · medium · standards

`VALIDATION_MESSAGE_RE = /^(\w+)\.(\w+): (.+)$/` reverse-engineers `PolicyFieldValidationError`'s
message (`types/errors.py:87`). The envelope exposes no structured field, so any wording change to the
server message silently downgrades inline field errors to a top-of-page banner — the E4-S2-AC2 path
degrades with no test able to notice.
**Fix:** include `product_type` and `field` in the error envelope for `PolicyFieldValidationError` (the
exception already carries both) and read those instead of parsing prose.

### CR-013 — wire types weaken unions to `string`, forcing a cast in the UI
- **File:** `frontend/src/types/review.ts:10,18` (cast at `frontend/src/ui/components/DocumentsStep.tsx:46`) · WARN · medium · standards

`ChecklistItem.type: string` and `ApplicationDetail.product_type: string` discard the `DocumentType` /
`ProductType` unions that already exist in `types/policy.ts`, which is why `DocumentsStep` needs
`item.type as DocumentType`. CLAUDE.md requires static typing everywhere; an assertion that re-asserts
a union the type system could have kept is the same loss.
**Fix:** type the two fields as `DocumentType` / `ProductType` and delete the cast.

### CR-014 — the customer's "home" affordance is labelled for a screen it does not open
- **File:** `frontend/src/config/roleRoutes.ts:30-35,57-59` (consumed at `frontend/src/ui/App.tsx:109`) · WARN · medium · spec

`home={{ to: landingPath(role), label: LANDING_NAME[role] }}`. For CUSTOMER, `landingPath` returns
`/home` while `LANDING_NAME` is "My applications", so the error/no-access/not-found screens offer a
button reading "My applications" that navigates to Home.
**Fix:** derive the label from the resolved path (or return `APPLICATIONS_PATH` for CUSTOMER, which is
what ui_spec §2 specifies as that role's landing screen).

### CR-015 — a usable default JWT signing secret ships in source
- **File:** `backend/src/truelend/config/settings.py:18,29` (also `DEMO_PASSWORD`, `backend/src/truelend/config/db.py:21`) · WARN · medium · standards

`_DEFAULT_JWT_SECRET = "dev-only-synthetic-secret-change-me"` is silently used whenever
`TRUELEND_JWT_SECRET` is unset, including in a deployed run; tokens then verify against a constant
published in the repository. Exploitability is the security-reviewer's call — flagged here as a
configuration-default smell on a boundary the context pack marks high-risk.
**Fix:** require the env var when `env` is not `test`/`dev` (raise at `Settings.from_env`), keeping the
literal only as a test default.

---

## INFO

### CR-016 — `ApplicationApproved` is published after commit, not "in the same transaction"
`backend/src/truelend/service/underwriting_service.py:176-178`, `service/review_service.py:179-184` · INFO · high · spec.
`api-contracts.md:124-125` and E3-S3 Scope both say the event is published in the same transaction as
the transition to APPROVED; it is emitted as a log line after `conn.commit()`, so a crash in the gap
loses it. No M1 subscriber, so impact is nil today — but the contract sentence is inaccurate.

### CR-017 — pinned policy version derived from `catalog[0]`
`backend/src/truelend/service/document_service.py:87` · INFO · high · standards.
`get_active_catalog(conn, policies_dir)[0].policy_version` raises `IndexError` (→ 500) if no APPROVED
policy exists, and reads the version off an arbitrary product rule. `policy_repo.get_active_version`
answers the question directly. Unreachable while startup seeding guarantees v1.

### CR-018 — dead protocols in `types/contracts.py`, one of which contradicts the shipped signature
`backend/src/truelend/types/contracts.py:33-48,60-63,66-71` · INFO · high · standards.
`AuditWriter`, `ScoreFunction` and `ApplicationApproved` have zero references in `backend/src` or
`backend/tests`. `AuditWriter.write(..., before: dict | None, after: dict | None)` does not match the
shipped `audit_repo.insert(..., before_status: str | None, after_status: str | None)`, so the one
"contract" type is stale. All three are mandated by `program-design.md:30-48`, so the fix is an
amendment or wiring, not a silent delete.

### CR-019 — the `Money` NewType is bypassed everywhere but `scoring`
`backend/src/truelend/types/money.py`, `service/underwriting_service.py:134` · INFO · high · standards.
Records carry bare `Decimal`, and underwriting re-launders it with `cast(Money, record.monthly_income)`,
which defeats the NewType's purpose (program-design declares money as `Money`).

### CR-020 — status mapping depends on dict insertion order
`backend/src/truelend/config/errors.py:16-41` · INFO · medium · standards.
`status_for_domain_error` returns the first `isinstance` hit while iterating `STATUS_BY_ERROR_TYPE`.
Correct today only because every subclass entry precedes its base; a future entry added in the wrong
position silently changes HTTP status codes. Ordering by specificity (or an explicit MRO walk) removes
the trap.

### CR-021 — known-acceptable query patterns at demo scale
`backend/src/truelend/api/policies_router.py:146-147` (loads all versions, slices in Python),
`backend/src/truelend/repository/documents_repo.py:120-139` (no `(status, uploaded_at)` index, noted in
its own docstring), `backend/src/truelend/config/db.py:107-112` (per-user loop insert — the perf-smell
gate's cited line) · INFO · high · standards. All bounded by synthetic demo data; worth an index
migration before any real volume.

### CR-022 — test-only routes live in the production app factory
`backend/src/truelend/api/main.py:118-183` · INFO · high · standards.
`/api/_test/boom` and `/api/_test/audited-action` (66 of 206 lines in `main.py`) are gated on
`settings.env == "test"` and now require ADMIN (F005 fix, 3a78015). Correct, but a test-only module
imported by the test app would keep the production factory free of fixtures.

### CR-023 — no uniqueness constraint behind the checklist's "one row per type" assumption
`backend/migrations/0003_applications_and_documents.sql` · INFO · medium · standards.
`application_documents` has no `UNIQUE(application_id, type)`, while `mark_uploaded` updates
`WHERE application_id = ? AND type = ?` — it would silently update every duplicate row. Only
`insert_checklist` writes rows today, so duplicates cannot occur; the constraint would make that
invariant enforced rather than assumed (new migration, append-only).

---

## Positives worth recording

- Domain-rule fidelity is high: E3-S2 and E3-S3 arithmetic, the reason-code sets, the
  pinned-policy-version behaviour (E3-S3-AC5) and the 409 vocabulary all match the sealed criteria.
- `policy_service._verify_file` hashes and returns the *same* bytes the caller parses, closing the
  hash-then-reread window; `_confined_path` resolves symlinks before the containment check.
- `auth_service` verifies a dummy scrypt hash for unknown emails (no enumeration via timing or status)
  and never branches on the JWT header's `alg`.
- `applications_repo.transition_status` is a compare-and-set, so concurrent resolutions cannot both win.
- Money and PII handling are the strongest part of the diff — fixed-point end to end, redaction applied
  before any handler, ids-only event logging.
