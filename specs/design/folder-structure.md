# Folder structure — TrueLend M1

One line per directory. Backend and frontend each mirror the layer order
`types → config → repository → service → api (→ ui)` per D-E and
`project-manifest.json#architecture.layer_roots`.

```
truelend-lending-platform/
  backend/
    src/
      truelend/
        types/            # enums, Protocols (AuthPrincipal/AuditWriter/ScoreFunction), domain errors, Money alias, DTOs
        config/            # settings, JSON logging + correlation + redaction, error-envelope mapping, db/migrations, money helper
        repository/        # sqlite3 access: users, audit, policy, applications, documents, decisions, resolutions
        service/            # auth, policy, application, verification, scoring, underwriting, review/override
        api/                # FastAPI routers, DI wiring (deps.py), middleware, main.py app factory
    migrations/             # numbered SQL files, checksummed into schema_migrations
    policies/               # immutable policy_v000N.json files
    tests/
      unit/                 # scoring, rule engine, policy validation — no DB, no HTTP
      api/                   # FastAPI TestClient, one file per router
      repo/                   # sqlite3-backed repository and trigger tests
      architecture/            # layering, money-float-scan, policy-immutability tests
    pyproject.toml
  frontend/
    src/
      types/                # Application, ProductRule, Document, Decision, Resolution, Policy wire shapes
      config/                 # messages.ts (error-code -> copy), tokens.css (ui_spec §4 custom properties)
      service/                 # TanStack Query hooks per resource (products, applications, documents, verification, policies)
      api/                      # httpClient.ts (fetch + auth header), authContext.ts
      ui/
        apply/                  # ApplyWizard + 3 steps (E2-S4)
        verification/            # VerificationQueuePage + row/dialog (E2-S4)
        decision/                 # DecisionPanel, ReviewActions, OverrideDialog (E3-S6)
        policy/                    # PolicyEditorPage, ProductThresholdForm (E4-S2)
        components/                 # shared primitives, one file per component (ui_spec §4.4)
    tests/
      unit/                        # Vitest component tests
    e2e/                            # Playwright specs
    package.json
  specs/                            # this design set, stories, decisions, test artefacts
  docs/                             # brief, business case, screenshots
  init.sh                          # single-command local run (Docker Compose; no-Docker uv+npm fallback)
  docker-compose.yml
```
