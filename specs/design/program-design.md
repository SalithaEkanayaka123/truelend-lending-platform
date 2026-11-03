# Program design — TrueLend M1 (E1–E4)

Types, signatures, call stacks and file layout the implementer is bound by.
Layering and naming follow `architecture.md`'s recorded-decisions table
(D-A, D-C, D-E, D-F, D-G). Backend types are written as Python
`dataclass`/`Protocol`; money is always `Decimal`, never `float`.

## Types

```
# backend/src/truelend/types/enums.py
Role = Literal["CUSTOMER", "UNDERWRITER", "POLICY_EDITOR", "ADMIN"]
ApplicationStatus = Literal["DRAFT", "SUBMITTED", "MANUAL_REVIEW", "APPROVED", "REJECTED"]
DocumentStatus = Literal["MISSING", "UPLOADED", "VERIFIED", "REJECTED"]
DecisionType = Literal["AUTO_APPROVE", "AUTO_REJECT", "MANUAL_REVIEW"]
ResolutionKind = Literal["MANUAL_REVIEW", "OVERRIDE"]
ResolutionOutcome = Literal["APPROVED", "REJECTED"]
PolicyStatus = Literal["DRAFT", "APPROVED"]
ProductType = Literal["PERSONAL", "VEHICLE", "EDUCATION"]
DocumentType = Literal["ID_PROOF", "ADDRESS_PROOF", "SALARY_SLIP", "VEHICLE_QUOTATION", "ADMISSION_LETTER", "FEE_STRUCTURE"]

# backend/src/truelend/types/money.py
Money = NewType("Money", Decimal)   # always 2-decimal Decimal; never float

# backend/src/truelend/types/contracts.py  (D-C: Protocols, no business logic)
class AuthPrincipal(Protocol):
    user_id: int
    role: Role
    email: str

class AuditWriter(Protocol):
    def write(
        self, *, actor: AuthPrincipal, action: str, entity_type: str, entity_id: int,
        correlation_id: str, reason_code: str | None = None, comment: str | None = None,
        before: dict | None = None, after: dict | None = None,
    ) -> None: ...

class ScoreFunction(Protocol):
    def __call__(self, age_years: int, monthly_income: Money, flags: "CreditFlags") -> int: ...

@dataclass(frozen=True)
class CreditFlags:
    prior_default: bool
    missed_payment_12m: bool
    thin_file: bool

@dataclass(frozen=True)
class ApplicationApproved:          # in-process domain event, F3 -> no M1 subscriber
    application_id: int

# backend/src/truelend/types/errors.py
class DomainError(Exception):
    code: str                        # maps 1:1 to the error-envelope `code`
class ValidationError(DomainError): ...        # -> 422
class NotFoundError(DomainError): ...          # -> 404
class ForbiddenError(DomainError): ...         # -> 403
class ConflictError(DomainError): ...          # -> 409, code set per call site
class PolicyViolationException(DomainError):   # code is always INCOME_BELOW_MIN in M1
    code: str = "INCOME_BELOW_MIN"

# backend/src/truelend/types/models.py  (Service-layer DTOs; API layer maps these to JSON)
User { id, email, role: Role, display_name, active: bool }
PolicyVersion { version: int, status: PolicyStatus, sha256: str, base_version: int | None,
                created_by: int, created_at: datetime, approved_by: int | None, approved_at: datetime | None }
ProductRule { product_type: ProductType, policy_version: int, min_age: int, max_age: int,
              min_income: Money, min_tenure_months: int, max_tenure_months: int,
              min_amount: Money, max_amount: Money, annual_rate_pct: Decimal,
              auto_reject_below_score: int, auto_approve_min_score: int,
              required_documents: list[DocumentType] }
Application { id, applicant_user_id: int, product_type: ProductType, requested_amount: Money,
              tenure_months: int, age_years: int, monthly_income: Money, credit_flags: CreditFlags,
              pan: str, aadhaar: str, status: ApplicationStatus, policy_version: int | None,
              created_at: datetime, submitted_at: datetime | None }
Document { id, application_id: int, type: DocumentType, status: DocumentStatus,
           filename: str | None, reason: str | None, uploaded_at: datetime | None,
           verified_by: int | None, verified_at: datetime | None }
Decision { id, application_id: int, decision: DecisionType, score: int,
           reason_codes: list[str], policy_version: int, decided_at: datetime }
Resolution { id, application_id: int, kind: ResolutionKind, outcome: ResolutionOutcome,
             reason_code: str | None, comment: str, resolved_by: int, resolved_at: datetime }
AuditEntry { id, occurred_at: datetime, actor_user_id: int, actor_role: Role, action: str,
             entity_type: str, entity_id: int, correlation_id: str, reason_code: str | None,
             comment: str | None, before: dict | None, after: dict | None }
```

```
// frontend/src/types/*.ts  (mirrors the backend wire shapes; money stays `string`)
interface ProductRule { productType; policyVersion: number; minAge; maxAge; minIncome: string;
  minTenureMonths; maxTenureMonths; minAmount: string; maxAmount: string; annualRatePct: string;
  requiredDocuments: DocumentType[] }
interface Application { id; status; productType; requestedAmount: string; tenureMonths;
  panMasked: string; aadhaarMasked: string; requiredDocuments: DocumentChecklistItem[];
  decision?: Decision; policyVersion?: number }
interface Decision { decision; score: number; reasonCodes: string[]; policyVersion: number }
interface DocumentChecklistItem { documentId?: number; type: DocumentType; status: DocumentStatus; reason?: string }
interface VerificationQueueItem { documentId: number; applicationId: number; type: DocumentType; uploadedAt: string }
interface PolicyVersionSummary { version: number; status: "DRAFT" | "APPROVED"; sha256: string }
```

## Signatures

```
# service/auth_service.py
login(email: str, password: str) -> LoginResult | None            # None -> 401 (uniform body)
resolve_principal(token: str) -> AuthPrincipal | None              # None -> 401 (missing/expired)

# service/policy_service.py
get_active_catalog() -> list[ProductRule]
get_policy(version: int) -> PolicyVersionDetail
list_policies() -> list[PolicyVersion]
create_policy(actor: AuthPrincipal, base_version: int, changes: dict) -> PolicyVersion   # 201 DRAFT, FA-F1.6 validation
approve_policy(actor: AuthPrincipal, version: int) -> PolicyVersion                      # ADMIN only

# service/application_service.py
apply(actor: AuthPrincipal, payload: ApplyRequest) -> Application          # FA-F2.2/F2.3/F2.4
get_application(actor: AuthPrincipal, application_id: int) -> Application  # 404 if not owner/staff
upload_document(actor: AuthPrincipal, application_id: int, type: DocumentType, filename: str) -> Document
submit(actor: AuthPrincipal, application_id: int) -> Application           # FA-F2.6

# service/verification_service.py
list_queue(actor: AuthPrincipal, limit: int, offset: int) -> Page[VerificationQueueItem]
decide_document(actor: AuthPrincipal, document_id: int, outcome: Literal["VERIFIED","REJECTED"], reason: str) -> Document

# service/scoring.py  (implements ScoreFunction; pure, no I/O)
score(age_years: int, monthly_income: Money, flags: CreditFlags) -> int    # FA-F3.2 fixed formula

# service/underwriting_service.py
class RuleEngine:
    def evaluate(self, application: Application, policy: ProductRule, score: int) -> DecisionResult: ...
        # raises PolicyViolationException(INCOME_BELOW_MIN) below min_income (FA-F3.3 step 1)
underwrite(actor: AuthPrincipal, application_id: int) -> DecisionResult    # 409 NOT_SUBMITTED / ALREADY_DECIDED

# service/review_service.py
review(actor: AuthPrincipal, application_id: int, outcome: Literal["APPROVE","REJECT"], reason: str) -> Application
override(actor: AuthPrincipal, application_id: int, reason_code: str, comment: str) -> Application

# repository/audit_repo.py (implements AuditWriter)
AuditRepo.write(*, actor, action, entity_type, entity_id, correlation_id, reason_code=None, comment=None, before=None, after=None) -> None
AuditRepo.list(entity_type: str | None, entity_id: int | None, action: str | None) -> list[AuditEntry]

# config/money.py
paise_to_decimal(paise: int) -> Decimal
decimal_to_paise(value: Decimal) -> int
decimal_to_wire(value: Decimal) -> str          # always 2 decimals, e.g. "92115.12"

# config/db.py
run_migrations(conn: sqlite3.Connection, migrations_dir: Path) -> None   # checksum-verified, idempotent
seed(conn: sqlite3.Connection) -> None                                   # users + policy v1 APPROVED
```

```
// frontend/src/service/*.ts
useProducts(): UseQueryResult<ProductRule[]>
useApplication(id: number): UseQueryResult<Application>
useCreateApplication(): UseMutationResult<Application, ApplyRequest>
useUploadDocument(applicationId): UseMutationResult<Document, {type, filename}>
useSubmitApplication(applicationId): UseMutationResult<Application, void>
useVerificationQueue(params): UseQueryResult<Page<VerificationQueueItem>>
useVerifyDocument(): UseMutationResult<Document, {documentId, outcome, reason}>
useReviewApplication(applicationId): UseMutationResult<Application, {outcome, reason}>
useOverrideApplication(applicationId): UseMutationResult<Application, {reasonCode, comment}>
useCreatePolicy(): UseMutationResult<PolicyVersion, {baseVersion, changes}>
usePolicies(): UseQueryResult<PolicyVersionSummary[]>
usePolicy(version: number): UseQueryResult<PolicyVersionDetail>
```

## Call stack

```
# Apply -> submit -> underwrite (hot path, E2-S2/E2-S3/E3-S3)
POST /api/applications
  applications_router.create_application
    deps.get_current_principal            (AuthPrincipal, D-C)
    application_service.apply
      policy_service.get_active_catalog    # validate amount/tenure range
      applications_repo.insert_application
      documents_repo.insert_checklist      # one row per required_documents entry, MISSING

POST /api/applications/{id}/documents
  documents_router.upload
    application_service.upload_document
      documents_repo.update_status(UPLOADED)

POST /api/applications/{id}/submit
  applications_router.submit
    application_service.submit
      documents_repo.all_uploaded_or_later?  -> 409 MISSING_DOCUMENTS
      policy_service.get_active_catalog       # pin policy_version
      applications_repo.update_status(SUBMITTED)

POST /api/applications/{id}/underwrite
  applications_router.underwrite
    underwriting_service.underwrite
      applications_repo.get(id)              -> 409 NOT_SUBMITTED / ALREADY_DECIDED
      policy_repo.get(application.policy_version)   # pinned, not active
      scoring.score(age, income, flags)
      RuleEngine.evaluate(application, policy, score)
        -> raises PolicyViolationException(INCOME_BELOW_MIN)   # caught here, persisted as AUTO_REJECT
      decisions_repo.insert(decision)
      applications_repo.update_status(mapped_status)
      [if APPROVED] publish ApplicationApproved          # same transaction, no M1 subscriber
      audit: none (automated decisions are not audited, FA-F3.6)
```

```
# Verify / review / override (audited path, E3-S1/E3-S5)
POST /api/documents/{id}/verify
  verification_router.decide
    verification_service.decide_document
      documents_repo.update_status(VERIFIED|REJECTED)   -> 409 ALREADY_VERIFIED
      audit_repo.write(DOCUMENT_VERIFIED|DOCUMENT_REJECTED)      # same transaction

POST /api/applications/{id}/review
  applications_router.review
    review_service.review
      applications_repo.get(id)              -> 409 NOT_IN_REVIEW
      resolutions_repo.insert(kind=MANUAL_REVIEW)
      applications_repo.update_status(mapped_status)
      audit_repo.write(REVIEW_APPROVED|REVIEW_REJECTED)
      [if APPROVED] publish ApplicationApproved

POST /api/applications/{id}/override
  applications_router.override
    review_service.override
      decisions_repo.get(id)                 -> 409 NOT_OVERRIDABLE (no AUTO_REJECT / already resolved)
      resolutions_repo.insert(kind=OVERRIDE)
      applications_repo.update_status(APPROVED)          # decisions row untouched
      audit_repo.write(DECISION_OVERRIDDEN, before, after, reason_code, comment)
      publish ApplicationApproved
```

```
// Apply wizard UI call stack (E2-S4)
ApplyWizard
  ProductStep       -> useProducts()
  DetailsStep       -> inline range validation from the selected ProductRule (no hardcoded policy values)
  DocumentsStep      -> useCreateApplication() on first Continue, then useUploadDocument() per row,
                         useSubmitApplication() on Submit, then navigate to decision view
VerificationQueuePage
  -> useVerificationQueue() -> DataTable (desktop) / RecordCard (mobile) -> useVerifyDocument() per row
```

## File tree

```
backend/
  src/truelend/
    types/
+     enums.py
+     contracts.py
+     errors.py
+     money.py
+     models.py
    config/
+     settings.py
+     logging.py
+     errors.py
+     db.py
+     money.py
    repository/
+     users_repo.py
+     audit_repo.py
+     policy_repo.py
+     applications_repo.py
+     documents_repo.py
+     decisions_repo.py
+     resolutions_repo.py
    service/
+     auth_service.py
+     policy_service.py
+     application_service.py
+     verification_service.py
+     scoring.py
+     underwriting_service.py
+     review_service.py
    api/
+     deps.py
+     middleware.py
+     auth_router.py
+     health_router.py
+     audit_router.py
+     products_router.py
+     policies_router.py
+     applications_router.py
+     documents_router.py
+     verification_router.py
+     main.py
  migrations/
+   0001_users_and_audit.sql
+   0002_policy_versions.sql
+   0003_applications_and_documents.sql
+   0004_decisions_and_resolutions.sql
  policies/
+   policy_v0001.json
  tests/
+   unit/ api/ repo/ architecture/

frontend/
  src/
    types/
+     application.ts  product.ts  policy.ts  document.ts
    config/
+     messages.ts  tokens.css
    service/
+     products.ts  applications.ts  documents.ts  verification.ts  policies.ts  queryClient.ts
    api/
+     httpClient.ts  authContext.ts
    ui/
      apply/
+       ApplyWizard.tsx  ProductStep.tsx  DetailsStep.tsx  DocumentsStep.tsx
      verification/
+       VerificationQueuePage.tsx  VerificationRow.tsx  VerifyDialog.tsx
      decision/
+       DecisionPanel.tsx  ReviewActions.tsx  OverrideDialog.tsx
      policy/
+       PolicyEditorPage.tsx  ProductThresholdForm.tsx
      components/
+       Button.tsx  TextField.tsx  MoneyField.tsx  Select.tsx  Toggle.tsx  StatusBadge.tsx
+       Card.tsx  Stepper.tsx  DataTable.tsx  RecordCard.tsx  Dialog.tsx  ConfirmDialog.tsx
+       Toast.tsx  Skeleton.tsx  EmptyState.tsx  ErrorState.tsx  ScoreGauge.tsx  AppShell.tsx
```
