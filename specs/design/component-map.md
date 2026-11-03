# Component map — TrueLend M1 (E1–E4)

Every production file a story **owns** (may edit) is backticked exactly
once, on that story's own row, in the **Files (owns)** column only. Backticks
never appear anywhere else in this document — not around a bare filename in
prose, not around an endpoint path, not next to another story's ID — because
`ownership-check.js` treats every backticked token on a line as owned by
every story ID on that same line (deliberately tolerant parsing; see
`.claude/skills/design/references/mode-11-machine-readable-artifacts.md`).
Cross-story relationships (Produces/Consumes) are therefore written as plain
prose in the **Interfaces** list under each epic, naming artifacts and story
IDs with no backticks at all.

A file touched by more than one story *within the same* cluster
(`specs/stories/story-clusters.json`) is backticked on each of that
cluster's rows — not a collision, since the cluster is the parallel-work
boundary, not the story. A file owned by one cluster and later extended by a
story in a *different* cluster is named in that story's Files cell without
a path, cross-referenced in **Shared files across clusters** at the end.

## E1 — Platform (clusters C1, C2, C3)

| Story | Title | Cluster | Files (owns) |
|---|---|---|---|
| E1-S1 | Authentication and role guard | C1 | `backend/src/truelend/repository/users_repo.py`, `backend/src/truelend/service/auth_service.py`, `backend/src/truelend/api/auth_router.py`, `backend/src/truelend/api/deps.py` |
| E1-S2 | Audit trail | C1 | `backend/src/truelend/repository/audit_repo.py`, `backend/src/truelend/api/audit_router.py` |
| E1-S3 | JSON logs, correlation IDs, redaction | C2 | `backend/src/truelend/config/logging.py`, `backend/src/truelend/api/middleware.py` |
| E1-S4 | Health, migrations, architecture guards | C3 | `backend/src/truelend/types/enums.py`, `backend/src/truelend/types/errors.py`, `backend/src/truelend/types/money.py`, `backend/src/truelend/types/contracts.py`, `backend/src/truelend/config/settings.py`, `backend/src/truelend/config/errors.py`, `backend/src/truelend/config/db.py`, `backend/src/truelend/config/money.py`, `backend/src/truelend/api/main.py`, `backend/src/truelend/api/health_router.py`, `backend/migrations/0001_users_and_audit.sql` |

### E1 interfaces

- E1-S1 produces the AuthPrincipal concrete JWT implementation and the auth
  dependency every other router declares. It has no upstream dependency.
- E1-S2 produces the AuditWriter concrete implementation, wired into the
  same-cluster deps.py from E1-S1. It consumes the AuthPrincipal produced by
  E1-S1 to stamp the actor on every audit row.
- E1-S3 produces correlation-ID middleware, the JSON access log line, and
  the PAN/Aadhaar/filename redaction filter. These are cross-cutting and
  applied to every request rather than consumed through an API; it has no
  upstream dependency.
- E1-S4 produces the AuthPrincipal, AuditWriter and ScoreFunction Protocol
  *declarations* (D-C) with zero business logic, the migration runner, the
  seed (users and policy version 1 APPROVED), the layering and float-scan
  test harness, and the app factory every router registers into. It has no
  upstream dependency, which is why it can ship in the same wave as E1-S1
  through E1-S3.

## E2 — Catalog, apply, documents (clusters C3, C4, C5)

| Story | Title | Cluster | Files (owns) |
|---|---|---|---|
| E2-S1 | Product catalog from the active policy | C3 | `backend/src/truelend/repository/policy_repo.py`, `backend/src/truelend/service/policy_service.py`, `backend/src/truelend/api/products_router.py`, `backend/migrations/0002_policy_versions.sql`, `backend/policies/policy_v0001.json` |
| E2-S2 | Apply for a loan | C3 | `backend/src/truelend/repository/applications_repo.py`, `backend/src/truelend/repository/documents_repo.py`, `backend/src/truelend/service/application_service.py`, `backend/src/truelend/api/applications_router.py`, `backend/migrations/0003_applications_and_documents.sql` |
| E2-S3 | Upload documents and submit | C4 | `backend/src/truelend/service/document_service.py` |
| E2-S4 | Apply wizard and verification queue UI | C5 | `frontend/src/types/*`, `frontend/src/config/messages.ts`, `frontend/src/config/tokens.css`, `frontend/src/api/httpClient.ts`, `frontend/src/api/authContext.ts`, `frontend/src/service/products.ts`, `frontend/src/service/applications.ts`, `frontend/src/service/documents.ts`, `frontend/src/service/verification.ts`, `frontend/src/ui/apply/*`, `frontend/src/ui/verification/*`, `frontend/src/ui/components/*` |

### E2 interfaces

- E2-S1 produces the GET /api/products catalog read and the startup
  policy-file hash check. It consumes the AuthPrincipal contract from E1-S1
  and the seeded policy version 1 (data) from E1-S4, its own cluster-mate.
- E2-S2 produces application creation, the per-product checklist, and the
  get-application read. It consumes the policy thresholds and checklist
  data from E2-S1 (same cluster) and the AuthPrincipal contract from E1-S1.
- E2-S3 produces the upload and submit routes, added to the
  applications_router module owned by E2-S2 (see Shared files). It consumes
  the application and checklist data produced by E2-S2 and extends the
  documents repository E2-S2 created with the upload/submit status
  transitions.
- E2-S4 produces the apply wizard, the verification queue page, and the
  shared UI component library (Button, TextField, MoneyField, Select,
  Toggle, StatusBadge, Card, Stepper, DataTable, RecordCard, Dialog,
  ConfirmDialog, Toast, Skeleton, EmptyState, ErrorState, AppShell) plus the
  http client, auth context and design tokens every later UI story reuses.
  It consumes the apply/upload/submit endpoint contract from E2-S3 and the
  verification-queue endpoint contract from E3-S1.

## E3 — Scoring, underwriting, review/override (clusters C4, C6, C7)

| Story | Title | Cluster | Files (owns) |
|---|---|---|---|
| E3-S1 | Verification queue | C4 | `backend/src/truelend/service/verification_service.py`, `backend/src/truelend/api/documents_router.py` |
| E3-S2 | Credit-scoring stub | C6 | `backend/src/truelend/service/scoring.py` |
| E3-S3 | Underwriting decision with reason codes | C4 | `backend/src/truelend/service/underwriting_service.py`, `backend/src/truelend/repository/decisions_repo.py`, `backend/migrations/0004_decisions_and_resolutions.sql` |
| E3-S4 | Minimum-income violation | C4 | `backend/src/truelend/service/underwriting_service.py` |
| E3-S5 | Manual review and override | C4 | `backend/src/truelend/service/review_service.py`, `backend/src/truelend/repository/resolutions_repo.py` |
| E3-S6 | Decision review and override UI | C7 | `frontend/src/service/decisions.ts`, `frontend/src/ui/decision/*` |

### E3 interfaces

- E3-S1 produces the verification-queue read and the verify/reject action.
  It consumes the uploaded-documents data from E2-S3 (same cluster) and the
  AuditWriter contract from E1-S2.
- E3-S2 produces the ScoreFunction concrete implementation, a pure function
  bound to the Protocol declared at scaffold time. It has no upstream
  dependency.
- E3-S3 produces the underwrite route, added to the applications_router
  module owned by E2-S2 (see Shared files), the rule engine, and the
  ApplicationApproved event publish. It consumes the ScoreFunction contract
  from E3-S2 and the submitted-application data from E2-S3 (same cluster).
- E3-S4 adds the income-floor branch (raising the policy-violation
  exception, caught and persisted as an automatic rejection) inside the same
  underwriting_service module as E3-S3, its cluster-mate — not a new file.
  It consumes the decision-persistence behavior E3-S3 already provides.
- E3-S5 produces the manual-review resolution and the AUTO_REJECT override,
  with their routes added to the applications_router module owned by
  E2-S2 (see Shared files). It consumes the decisions data from E3-S3 (same
  cluster) and the AuditWriter contract from E1-S2.
- E3-S6 produces the decision panel, review actions and override dialog. It
  consumes the shared UI component library, http client and design tokens
  from E2-S4, and the review/override endpoint contract from E3-S5.

## E4 — Policy versions (clusters C3, C8)

| Story | Title | Cluster | Files (owns) |
|---|---|---|---|
| E4-S1 | Create and approve policy versions | C3 | `backend/src/truelend/api/policies_router.py` |
| E4-S2 | Policy editor UI | C8 | `frontend/src/service/policies.ts`, `frontend/src/ui/policy/*` |

### E4 interfaces

- E4-S1 produces the create and approve policy endpoints, extending the
  policy service and policy repository modules E2-S1 created, its
  cluster-mate. It consumes the seeded policy version 1 (data) from E1-S4
  and the AuditWriter and AuthPrincipal contracts from E1-S2 and E1-S1.
- E4-S2 produces the per-product threshold forms and the draft-version
  confirmation. It consumes the shared UI component library, http client
  and design tokens from E2-S4, and the policy endpoint contract from E4-S1.

## Shared files across clusters

These are deliberate shared surfaces, sequenced by the dependency graph
(`specs/stories/dependency-graph.md`) rather than edited concurrently by two
clusters — the route-registry/shared-repository case the ownership sensor
is designed to tolerate with a warning rather than block on:

- `backend/src/truelend/api/applications_router.py` is owned by E2-S2 (C3).
  E2-S3, E3-S3 and E3-S5 (all C4, all sequenced after E2-S2 ships per
  `dependency-graph.md`) each add their own route function to this same
  FastAPI router for the `applications` resource: documents/submit,
  underwrite, and review/override respectively.
- `backend/src/truelend/repository/documents_repo.py` is owned by E2-S2
  (C3), which inserts the per-product checklist rows at apply time. E2-S3
  and E3-S1 (both C4) add the UPLOADED/VERIFIED/REJECTED status-transition
  functions once that checklist exists.
- `backend/src/truelend/service/policy_service.py` and
  `backend/src/truelend/repository/policy_repo.py` are owned by E2-S1 (C3).
  E4-S1 (also C3, same cluster) extends both with create/approve behavior.
- `backend/src/truelend/types/contracts.py` is owned by E1-S4 (C3). It holds
  only the three Protocol declarations (D-C); no story edits it after E1-S4
  lands — each owning story (E1-S1, E1-S2, E3-S2) instead binds its concrete
  implementation to the Protocol inside `api/deps.py`.
