# Test Plan

Scope: 16 stories, 73 acceptance criteria.
Machine spine: `verification-matrix.json` (one row per AC). Behavior scenarios are that list in Given/When/Then — not extra cases, not Cucumber, not AT source.

## Named Seams (Ports-and-Adapters)

| Story | Seam (port) | Real adapter | Test-double adapter |
| --- | --- | --- | --- |
| E1-S1 | Auth API (login, JWT dependency); Clock | FastAPI app over SQLite; system Clock | fixed/advanceable Clock |
| E1-S2 | Audit writer / audit read API | SQLite with append-only triggers | none |
| E1-S3 | Logging middleware + redaction filter; documents API (for AC4) | captured stdout/log handler | none (AC4 uses the real documents API plus captured logs) |
| E1-S4 | Health, migration runner, layer/money static checks | SQLite + file system | none |
| E2-S1 | Policy loader / products API | policy_v0001.json on disk | temp policy dir |
| E2-S2 | Applications API | SQLite repository | none |
| E2-S3 | Documents + submit API | SQLite repository | none |
| E2-S4 | Apply and verification-queue screens | Vite app against API | Playwright viewports |
| E3-S1 | Verification queue/verify API | SQLite repository | none |
| E3-S2 | Credit scoring function (pure) | in-process | none |
| E3-S3 | Underwrite service + API | SQLite, pinned policy | in-memory event bus |
| E3-S4 | Rule engine (pure) + underwrite API | in-process | none |
| E3-S5 | Review / override API | SQLite repository | in-memory event bus |
| E3-S6 | Underwriter review screens | Vite app against API | Playwright viewports |
| E4-S1 | Policies API + policy file store | temp policy dir + SQLite | none |
| E4-S2 | Policy editor screens | Vite app against API | Playwright viewports |

## Behavior scenarios (Given / When / Then)

Human-reviewed behavior spec. Implement-time ATs match this wording. Do not write `.feature` or AT source here.

| AC | Matrix | Given | When | Then |
| --- | --- | --- | --- | --- |
| E1-S1-AC1 | VM-001 | seeded user customer1@example.test with the correct password | they POST /api/auth/login | the response is 200 with expires_in 1800 and role CUSTOMER |
| E1-S1-AC2 | VM-002 | a wrong password | they POST /api/auth/login | it is 401 UNAUTHENTICATED with no token and the same body whether or not the email exists |
| E1-S1-AC3 | VM-003 | no Authorization header, or a token 1801 seconds old | they GET /api/auth/me | it is 401 |
| E1-S1-AC4 | VM-004 | a CUSTOMER token | they GET /api/audit | it is 403 FORBIDDEN |
| E1-S1-AC5 | VM-005 | the registered route table | it is enumerated | every route except POST /api/auth/login and GET /health declares the auth dependency |
| E1-S2-AC1 | VM-006 | UNDERWRITER user 3 performing an audited action on application 7 | it succeeds | one audit_log row has actor_user_id 3, actor_role UNDERWRITER, entity_type application, entity_id 7, a UTC occurred_at, and correlation_id equal to the response header |
| E1-S2-AC2 | VM-007 | an existing audit row | any UPDATE or DELETE runs on audit_log | the database aborts and the row is unchanged |
| E1-S2-AC3 | VM-008 | 3 audit rows for application 7 and 2 for application 8 | ADMIN GETs /api/audit?entity_type=application&entity_id=7 | exactly 3 rows return in ascending id order |
| E1-S2-AC4 | VM-009 | an audited action that fails with a 409 | the request ends | no audit row exists for it, because the audit write shares the action's transaction |
| E1-S3-AC1 | VM-010 | any completed request | output is captured | exactly one JSON log line has the keys ts, level, event, correlation_id, method, path, status, duration_ms |
| E1-S3-AC2 | VM-011 | no inbound X-Correlation-ID, or an inbound `req-12345678`, or an inbound `a b!` | the request completes | a missing header yields a UUID4 echoed in the response header and equal to the log's correlation_id, `req-12345678` is reused as-is, and `a b!` is replaced by a UUID4 |
| E1-S3-AC3 | VM-012 | an application created with PAN ABCDE1234F and Aadhaar 1234 5678 9012 | all captured logs, including error paths, are scanned | neither ABCDE1234F, 123456789012, nor 1234 5678 9012 appears |
| E1-S3-AC4 | VM-013 | a document upload with filename salary_slip_jan.pdf | logs are scanned | the document ID appears and the filename does not |
| E1-S3-AC5 | VM-014 | an unhandled exception | it propagates | the response is 500 with the error envelope and no stack trace, and the trace is logged as JSON through the redaction filter |
| E1-S4-AC1 | VM-015 | the process has reported ready | GET /health is requested without a token | it is 200 {"status":"ok"} in at most 1000 ms |
| E1-S4-AC2 | VM-016 | migrations 0001 through 0003 already applied | the app starts again | none re-run and schema_migrations still has 3 rows with SHA-256 values |
| E1-S4-AC3 | VM-017 | applied migration 0002 edited on disk | the app starts | startup aborts with MIGRATION_CHECKSUM_MISMATCH and /health never returns 200 |
| E1-S4-AC4 | VM-018 | the source tree under backend/src/truelend and frontend/src | the layer test runs | no module imports from a higher layer in the order types, config, repository, service, api, ui |
| E1-S4-AC5 | VM-019 | the money code paths | the static scan runs | it finds no float type, no float( call, and no REAL money column |
| E2-S1-AC1 | VM-020 | seeded policy version 1 | an authenticated user GETs /api/products | exactly 3 products return (PERSONAL, VEHICLE, EDUCATION), each with policy_version 1 |
| E2-S1-AC2 | VM-021 | version 1 | the rule sets are compared pairwise | each differs in at least one threshold (min_income is 25000.00, 30000.00, 20000.00) |
| E2-S1-AC3 | VM-022 | version 1 | the catalog is read | required_documents has 3 entries for PERSONAL and 4 each for VEHICLE and EDUCATION |
| E2-S1-AC4 | VM-023 | no token | GET /api/products is requested | it is 401 |
| E2-S1-AC5 | VM-024 | policy_v0001.json edited on disk | the app starts | startup aborts with POLICY_CHECKSUM_MISMATCH |
| E2-S2-AC1 | VM-025 | customer user 4 and policy v1 | they POST /api/applications with PERSONAL, amount "200000.00", tenure 24, age 30, income "60000.00", no flags, PAN ABCDE1234F, Aadhaar 123456789012 | it is 201 with id 1, status DRAFT, applicant_user_id 4 |
| E2-S2-AC2 | VM-026 | that application | it is returned | required_documents is ID_PROOF, ADDRESS_PROOF, SALARY_SLIP (each MISSING); a VEHICLE application lists 4 documents including VEHICLE_QUOTATION; an EDUCATION one includes ADMISSION_LETTER and FEE_STRUCTURE |
| E2-S2-AC3 | VM-027 | PERSONAL | tenure is 72 (max 60), or amount is "10000.00" (min 50000.00) | it is 422 TENURE_OUT_OF_RANGE or 422 AMOUNT_OUT_OF_RANGE respectively |
| E2-S2-AC4 | VM-028 | PAN "abc" or an 11-digit Aadhaar | posted | it is 422 VALIDATION_ERROR; a valid application returns pan_masked "******234F" and aadhaar_masked "********9012" and no raw values |
| E2-S2-AC5 | VM-029 | customer user 5 | they GET /api/applications/1 | it is 404 |
| E2-S3-AC1 | VM-030 | application 1 in DRAFT | the owner POSTs {type:"ID_PROOF", filename:"id_front.png"} | it is 201 and that document is UPLOADED with no file content stored |
| E2-S3-AC2 | VM-031 | PERSONAL application 1 | they POST type VEHICLE_QUOTATION | it is 422 DOCUMENT_TYPE_NOT_REQUIRED |
| E2-S3-AC3 | VM-032 | SALARY_SLIP is still MISSING | they POST submit | it is 409 MISSING_DOCUMENTS with missing ["SALARY_SLIP"] and status stays DRAFT |
| E2-S3-AC4 | VM-033 | all 3 documents UPLOADED and the active version 1 | they POST submit | it is 200, status SUBMITTED, policy_version 1, and submitted_at set |
| E2-S3-AC5 | VM-034 | an already SUBMITTED application | submit is posted again | it is 409 ALREADY_SUBMITTED |
| E2-S4-AC1 | VM-035 | a customer on a 375x812 viewport | they apply | a three-step flow (Product, Details, Documents and submit) shows one step at a time with a progress indicator and no horizontal scroll |
| E2-S4-AC2 | VM-036 | the Details step | they enter tenure 72 for PERSONAL | an inline error shows "12-60 months" before they continue |
| E2-S4-AC3 | VM-037 | an underwriter on 1280x800 | they open the queue | a table lists documents; at 375x812 the same data shows as stacked cards; verifying one removes it without a page reload |
| E3-S1-AC1 | VM-038 | submitted application 1 with 3 UPLOADED documents | UNDERWRITER user 3 GETs /api/verification-queue | 3 items return oldest first, each with document_id, application_id 1, and type |
| E3-S1-AC2 | VM-039 | document 1 | user 3 POSTs {outcome:"VERIFIED", reason:"Name matches PAN record"} | it is 200 VERIFIED, verified_by 3, an audit row DOCUMENT_VERIFIED is written, and the item leaves the queue |
| E3-S1-AC3 | VM-040 | document 2 | user 3 POSTs {outcome:"REJECTED", reason:"Image unreadable"} | it is 200 REJECTED with the reason, an audit row DOCUMENT_REJECTED is written, and the application still reads SUBMITTED |
| E3-S1-AC4 | VM-041 | a missing, empty, or 501-character reason | posted | it is 422 VALIDATION_ERROR and no audit row is written |
| E3-S1-AC5 | VM-042 | a CUSTOMER token, or an already VERIFIED document | they GET the queue or POST verify, or verify is posted again | it is 403 for the CUSTOMER token and 409 ALREADY_VERIFIED for the already-verified document |
| E3-S2-AC1 | VM-043 | age 40, income "100000.00", no flags | scored | the score is 740 |
| E3-S2-AC2 | VM-044 | age 30 with income "60000.00" and no flags, or age 30 with income "30000.00" and prior_default | scored | the first scores 680 and the second scores 500 |
| E3-S2-AC3 | VM-045 | the same inputs | scored 100 times | all 100 scores are identical |
| E3-S2-AC4 | VM-046 | the 680 baseline | one input changes at a time | age 40 gives 700, income "70000.00" gives 690, missed_payment_12m gives 620, thin_file gives 640, and prior_default gives 530 |
| E3-S2-AC5 | VM-047 | age 18, income "0.00" and all three flags, or age 40 with income "150000.00" or "500000.00" | scored | the first scores 350 and both of the second case scores are 790 |
| E3-S3-AC1 | VM-048 | a submitted PERSONAL application (age 40, income "100000.00", no flags, pinned version 1) | underwritten | decision AUTO_APPROVE, score 740, reason_codes ["SCORE_MEETS_AUTO_APPROVE"], policy_version 1, status APPROVED, and one ApplicationApproved event is published |
| E3-S3-AC2 | VM-049 | age 30, income "60000.00", no flags (score 680, review band 600-699) | underwritten | decision MANUAL_REVIEW with ["SCORE_IN_REVIEW_BAND"] and status MANUAL_REVIEW |
| E3-S3-AC3 | VM-050 | age 30, income "30000.00", prior_default (score 500) | underwritten | decision AUTO_REJECT with ["SCORE_BELOW_MIN"] and status REJECTED |
| E3-S3-AC4 | VM-051 | age 70, income "100000.00" (score 700) | underwritten | decision AUTO_REJECT with ["AGE_OUT_OF_RANGE"] only |
| E3-S3-AC5 | VM-052 | application A submitted under version 1, version 2 (PERSONAL min_income "30000.00") approved afterwards, and application B submitted after that, both age 30 with income "26000.00" | underwritten | A uses policy_version 1 and is MANUAL_REVIEW (score 640), while B uses policy_version 2 and is AUTO_REJECT with ["INCOME_BELOW_MIN"] |
| E3-S3-AC6 | VM-053 | a DRAFT application, or an already decided one | underwrite is called | the DRAFT case is 409 NOT_SUBMITTED and the already-decided case is 409 ALREADY_DECIDED with the stored decision unchanged |
| E3-S4-AC1 | VM-054 | PERSONAL with min_income "25000.00" | the rule engine evaluates income "24999.99" | it raises PolicyViolationException with code INCOME_BELOW_MIN |
| E3-S4-AC2 | VM-055 | income exactly "25000.00" (age 30, no flags, score 640) | evaluated | no exception is raised and the decision is MANUAL_REVIEW |
| E3-S4-AC3 | VM-056 | a submitted application with income "24999.99" | underwrite is called | it is 200 with AUTO_REJECT, reason_codes ["INCOME_BELOW_MIN"], status REJECTED, and a persisted decisions row |
| E3-S5-AC1 | VM-057 | application 2 in MANUAL_REVIEW | UNDERWRITER user 3 POSTs {outcome:"APPROVE", reason:"Stable income, documents verified"} | it is 200, status APPROVED, resolution MANUAL_REVIEW/APPROVED, an audit row REVIEW_APPROVED with actor 3, and an ApplicationApproved event |
| E3-S5-AC2 | VM-058 | the same state | they POST REJECT with a reason | status REJECTED, audit row REVIEW_REJECTED, and no event |
| E3-S5-AC3 | VM-059 | application 3 with decision AUTO_REJECT | ADMIN user 1 POSTs {reason_code:"COMPENSATING_FACTORS", comment:"Co-signed by parent; income verified"} | it is 200, status APPROVED, the decision row still reads AUTO_REJECT, an audit row DECISION_OVERRIDDEN with actor 1, the reason code, the comment, before REJECTED/after APPROVED, and an event |
| E3-S5-AC4 | VM-060 | application 4 with AUTO_REJECT | UNDERWRITER user 3 overrides with DATA_CORRECTION | the same outcome as AC3 with actor 3 in the audit row |
| E3-S5-AC5 | VM-061 | an application in MANUAL_REVIEW or already overridden, or a reason_code "FOO" or an empty comment, or review on an application not in MANUAL_REVIEW, or a CUSTOMER token | override or review is called | it is 409 NOT_OVERRIDABLE, 422, 409 NOT_IN_REVIEW, and 403 respectively |
| E3-S6-AC1 | VM-062 | an underwriter opening application 2 | the page loads | it shows score 680, the reason code with its message, and policy version 1; at 375x812 the panels stack with no horizontal scroll |
| E3-S6-AC2 | VM-063 | the override dialog on an AUTO_REJECT application | the comment is empty or no reason code is chosen | Submit is disabled; with both set it enables and success shows a confirmation |
| E3-S6-AC3 | VM-064 | a MANUAL_REVIEW application | the reason field is empty | Approve and Reject are disabled |
| E4-S1-AC1 | VM-065 | POLICY_EDITOR user 2 | they POST /api/policies with base_version 1 and PERSONAL.min_income "30000.00" | it is 201 with version 2, status DRAFT, file policy_v0002.json written, an audit row POLICY_CREATED, and the SHA-256 of policy_v0001.json unchanged |
| E4-S1-AC2 | VM-066 | version 2 is DRAFT | GET /api/products | PERSONAL min_income is still "25000.00" and policy_version is 1 |
| E4-S1-AC3 | VM-067 | ADMIN user 1 | they POST /api/policies/2/approve | it is 200 APPROVED with approved_by 1, an audit row POLICY_APPROVED, and GET /api/products shows PERSONAL min_income "30000.00" with policy_version 2 |
| E4-S1-AC4 | VM-068 | approved version 1 | PUT, PATCH, or DELETE hits /api/policies/1, or a raw SQL UPDATE changes its thresholds | the HTTP verbs return 405 and the SQL UPDATE aborts at the database |
| E4-S1-AC5 | VM-069 | POLICY_EDITOR user 2 | they POST /api/policies/2/approve | it is 403 |
| E4-S1-AC6 | VM-070 | a change setting auto_reject_below_score 750 with auto_approve_min_score 700, or min_income "-1" | POSTed | it is 422 VALIDATION_ERROR naming the offending field and no file is written |
| E4-S2-AC1 | VM-071 | a POLICY_EDITOR on a 375x812 viewport | they open the policy editor | the product forms stack in one column with no horizontal scroll |
| E4-S2-AC2 | VM-072 | the PERSONAL form | they enter min_age 70 with max_age 60 | an inline error appears before submit and the Save button is disabled |
| E4-S2-AC3 | VM-073 | valid changes | they Save | the page shows "Draft v2" and the new version appears in the list |

## Proposed sprint-contract checks

Evaluator QA procedure (`api` / `playwright`). Fill Observe (method/path or UI steps). Do not write `sprint-contracts/*.json` or Playwright files in this phase.

| Group | Check id | Kind | Matrix ids | Observe |
| --- | --- | --- | --- | --- |
| A | QA-VM-001 | api | VM-001 | POST /api/auth/login seeded customer1; expect 200, expires_in 1800, role CUSTOMER |
| A | QA-VM-002 | api | VM-002 | POST /api/auth/login wrong password for known and unknown email; expect 401 UNAUTHENTICATED, identical bodies, no token |
| A | QA-VM-003 | api | VM-003 | GET /api/auth/me with no header and with a 1801s-old token; expect 401 each |
| A | QA-VM-004 | api | VM-004 | GET /api/audit with CUSTOMER token; expect 403 FORBIDDEN |
| A | QA-VM-005 | api | VM-005 | GET /openapi.json -> 200 with TRUELEND_ENV=test; enumerate the app route table (including /api/_test/boom, which requires ADMIN); every route but POST /api/auth/login and GET /health has the auth dependency |
| A | QA-VM-012 | api | VM-012 | POST /api/applications with PAN ABCDE1234F and Aadhaar 1234 5678 9012 (success and a 422 error path); scan captured logs for ABCDE1234F, 123456789012, 1234 5678 9012; expect none |
| A | QA-VM-013 | api | VM-013 | POST /api/applications/{id}/documents {type, filename salary_slip_jan.pdf}; capture logs; expect the document id present and the filename absent |
| A | QA-VM-014 | api | VM-014 | GET /api/_test/boom -> 500 with an ADMIN token, app started with TRUELEND_ENV=test (test-only route raising an unhandled exception); expect error envelope with no stack trace, and a JSON log line holding the redacted trace |
| A | QA-VM-014-NT | api | VM-014 | GET /api/_test/boom -> 404 with an ADMIN token, app started with TRUELEND_ENV unset (and again with a non-test value); expect the route is not registered, so the error envelope is NOT_FOUND and no exception is raised |
| A | QA-VM-015 | api | VM-015 | GET /health with no token; expect 200 {"status":"ok"} in at most 1000 ms |
| B | QA-VM-006 | api | VM-006 | GET /api/audit?entity_type=application&entity_id=7 -> 200 as ADMIN, after user 3 performed an audited action on application 7; row has actor, role, entity, UTC occurred_at, correlation_id == X-Correlation-ID response header |
| B | QA-VM-007 | api | VM-007 | GET /api/audit -> 200 as ADMIN; then run UPDATE and DELETE on audit_log via sqlite; expect abort and rows unchanged |
| B | QA-VM-008 | api | VM-008 | GET /api/audit?entity_type=application&entity_id=7 as ADMIN; expect 3 rows ascending by id |
| B | QA-VM-009 | api | VM-009 | GET /api/audit?entity_type=application&entity_id=1 -> 200 as ADMIN, after an action that returned 409; expect no audit row for it |
| B | QA-VM-020 | api | VM-020 | GET /api/products authenticated; expect 3 products PERSONAL/VEHICLE/EDUCATION, policy_version 1 |
| B | QA-VM-021 | api | VM-021 | GET /api/products; compare rule sets pairwise; min_income 25000.00/30000.00/20000.00 |
| B | QA-VM-022 | api | VM-022 | GET /api/products; required_documents count 3 for PERSONAL, 4 for VEHICLE and EDUCATION |
| B | QA-VM-023 | api | VM-023 | GET /api/products with no token; expect 401 |
| B | QA-VM-024 | api | VM-024 | GET /health -> 200 on a clean start; then edit policy_v0001.json on disk and restart; expect abort POLICY_CHECKSUM_MISMATCH |
| C | QA-VM-025 | api | VM-025 | POST /api/applications as customer 4 with the AC payload; expect 201, id 1, DRAFT, applicant_user_id 4 |
| C | QA-VM-026 | api | VM-026 | GET /api/applications/1 and a VEHICLE and EDUCATION equivalent; assert required_documents lists, all MISSING |
| C | QA-VM-027 | api | VM-027 | POST /api/applications PERSONAL tenure 72, then amount 10000.00; expect 422 TENURE_OUT_OF_RANGE / AMOUNT_OUT_OF_RANGE |
| C | QA-VM-028 | api | VM-028 | POST /api/applications with PAN 'abc', 11-digit Aadhaar -> 422 VALIDATION_ERROR; valid -> pan_masked ******234F, aadhaar_masked ********9012, no raw values |
| C | QA-VM-029 | api | VM-029 | GET /api/applications/1 as customer 5; expect 404 |
| D | QA-VM-030 | api | VM-030 | POST /api/applications/1/documents {type ID_PROOF, filename id_front.png}; expect 201 UPLOADED, no content stored |
| D | QA-VM-031 | api | VM-031 | POST /api/applications/1/documents type VEHICLE_QUOTATION on PERSONAL; expect 422 DOCUMENT_TYPE_NOT_REQUIRED |
| D | QA-VM-032 | api | VM-032 | POST /api/applications/1/submit with SALARY_SLIP MISSING; expect 409 MISSING_DOCUMENTS missing [SALARY_SLIP], status DRAFT |
| D | QA-VM-033 | api | VM-033 | POST /api/applications/1/submit -> 200 after all 3 documents are UPLOADED; expect SUBMITTED, policy_version 1, submitted_at set |
| D | QA-VM-034 | api | VM-034 | POST /api/applications/1/submit -> 409 on an already SUBMITTED application; expect ALREADY_SUBMITTED |
| F | QA-VM-035 | playwright | VM-035 | Playwright at 375x812: open apply flow; assert one step visible at a time, progress indicator, no horizontal scroll (scrollWidth <= clientWidth) |
| F | QA-VM-036 | playwright | VM-036 | Playwright: Details step, enter tenure 72 for PERSONAL; assert inline '12-60 months' error before Continue |
| F | QA-VM-037 | playwright | VM-037 | Playwright as underwriter: at 1280x800 assert table, at 375x812 stacked cards; verify a document and assert row removed with no navigation |
| E | QA-VM-038 | api | VM-038 | GET /api/verification-queue as user 3; expect 3 items oldest first with document_id, application_id 1, type |
| E | QA-VM-039 | api | VM-039 | POST /api/documents/1/verify -> 200 as user 3 {VERIFIED, reason}; expect verified_by 3, audit DOCUMENT_VERIFIED, item gone from queue |
| E | QA-VM-040 | api | VM-040 | POST /api/documents/2/verify -> 200 as user 3 {REJECTED, reason}; expect audit DOCUMENT_REJECTED, application still SUBMITTED |
| E | QA-VM-041 | api | VM-041 | POST /api/documents/1/verify -> 422 with missing, empty, and 501-char reason; expect VALIDATION_ERROR and no audit row |
| E | QA-VM-042 | api | VM-042 | GET /api/verification-queue -> 403 with CUSTOMER token; also POST /api/documents/1/verify -> 403; re-POST on a VERIFIED document -> 409 ALREADY_VERIFIED |
| A | QA-VM-043 | api | VM-043 | POST /api/applications/1/underwrite -> 200 for age 40, income 100000.00, no flags; expect score 740 in the decision |
| A | QA-VM-044 | api | VM-044 | POST /api/applications/1/underwrite -> 200 for age 30/60000.00/no flags (score 680); repeat for age 30/30000.00/prior_default (score 500) |
| A | QA-VM-045 | api | VM-045 | POST /api/applications/1/underwrite -> 200; repeat the scoring on identical inputs 100 times (via fresh applications); expect one distinct score |
| A | QA-VM-046 | api | VM-046 | POST /api/applications/1/underwrite -> 200 from the 680 baseline, varying one input each; expect 700, 690, 620, 640, 530 |
| A | QA-VM-047 | api | VM-047 | POST /api/applications/1/underwrite -> 200 for age 18/0.00/all flags (350) and age 40/150000.00 and 500000.00 (790) |
| E | QA-VM-048 | api | VM-048 | POST /api/applications/{id}/underwrite for the AC case; expect AUTO_APPROVE, 740, SCORE_MEETS_AUTO_APPROVE, v1, APPROVED, one ApplicationApproved event |
| E | QA-VM-049 | api | VM-049 | POST /api/applications/2/underwrite -> 200 for age 30/60000.00; expect MANUAL_REVIEW, SCORE_IN_REVIEW_BAND, status MANUAL_REVIEW |
| E | QA-VM-050 | api | VM-050 | POST /api/applications/3/underwrite -> 200 for age 30/30000.00/prior_default; expect AUTO_REJECT, SCORE_BELOW_MIN, REJECTED |
| E | QA-VM-051 | api | VM-051 | POST /api/applications/4/underwrite -> 200 for age 70/100000.00; expect AUTO_REJECT with reason_codes exactly [AGE_OUT_OF_RANGE] |
| E | QA-VM-052 | api | VM-052 | POST /api/applications/{A}/underwrite -> 200 and POST /api/applications/{B}/underwrite -> 200 after approving v2 between submissions; A v1 MANUAL_REVIEW score 640, B v2 AUTO_REJECT INCOME_BELOW_MIN |
| E | QA-VM-053 | api | VM-053 | POST /api/applications/{id}/underwrite -> 409 on a DRAFT (NOT_SUBMITTED) and on a decided application (ALREADY_DECIDED, stored decision unchanged) |
| F | QA-VM-054 | api | VM-054 | POST /api/applications/1/underwrite -> 200 with income 24999.99 vs min 25000.00; expect INCOME_BELOW_MIN raised by the rule engine and surfaced as the reason code |
| F | QA-VM-055 | api | VM-055 | POST /api/applications/1/underwrite -> 200 with income 25000.00 (age 30, score 640); expect no policy violation, MANUAL_REVIEW |
| F | QA-VM-056 | api | VM-056 | POST /api/applications/1/underwrite -> 200 with income 24999.99; expect AUTO_REJECT [INCOME_BELOW_MIN], REJECTED, decisions row persisted |
| F | QA-VM-057 | api | VM-057 | POST /api/applications/2/review {APPROVE, reason} as user 3; expect 200 APPROVED, audit REVIEW_APPROVED actor 3, ApplicationApproved event |
| F | QA-VM-058 | api | VM-058 | POST /api/applications/2/review {REJECT, reason}; expect REJECTED, audit REVIEW_REJECTED, no event |
| F | QA-VM-059 | api | VM-059 | POST /api/applications/3/override as ADMIN user 1 {COMPENSATING_FACTORS, comment}; expect APPROVED, decision row still AUTO_REJECT, audit DECISION_OVERRIDDEN before/after, event |
| F | QA-VM-060 | api | VM-060 | POST /api/applications/4/override as UNDERWRITER user 3 {DATA_CORRECTION}; same outcome, actor 3 |
| F | QA-VM-061 | api | VM-061 | POST /api/applications/{id}/override -> 409 NOT_OVERRIDABLE for MANUAL_REVIEW or already overridden; -> 422 for reason_code FOO or empty comment; POST /api/applications/{id}/review -> 409 NOT_IN_REVIEW; CUSTOMER -> 403 |
| G | QA-VM-062 | playwright | VM-062 | Playwright as underwriter open application 2; assert score 680, reason code message, policy v1; at 375x812 panels stack, no horizontal scroll |
| G | QA-VM-063 | playwright | VM-063 | Playwright: open override dialog; Submit disabled with empty comment or no reason code, enabled with both, confirmation on success |
| G | QA-VM-064 | playwright | VM-064 | Playwright: MANUAL_REVIEW page with empty reason; assert Approve and Reject disabled |
| C | QA-VM-065 | api | VM-065 | POST /api/policies base_version 1 PERSONAL.min_income 30000.00 as user 2; expect 201 v2 DRAFT, policy_v0002.json written, audit POLICY_CREATED, SHA-256 of policy_v0001.json unchanged |
| C | QA-VM-066 | api | VM-066 | GET /api/products -> 200 while v2 is DRAFT; PERSONAL min_income 25000.00, policy_version 1 |
| C | QA-VM-067 | api | VM-067 | POST /api/policies/2/approve as ADMIN; expect 200 APPROVED, approved_by 1, audit POLICY_APPROVED, GET /api/products shows 30000.00 v2 |
| C | QA-VM-068 | api | VM-068 | PUT /api/policies/1 -> 405; PATCH and DELETE /api/policies/1 -> 405; raw SQL UPDATE of its thresholds aborts |
| C | QA-VM-069 | api | VM-069 | POST /api/policies/2/approve as POLICY_EDITOR user 2; expect 403 |
| C | QA-VM-070 | api | VM-070 | POST /api/policies with auto_reject_below_score 750 > auto_approve_min_score 700, and min_income -1; expect 422 VALIDATION_ERROR naming field, no file written |
| D | QA-VM-071 | playwright | VM-071 | Playwright 375x812 as POLICY_EDITOR open policy editor; assert single-column stacked forms, no horizontal scroll |
| D | QA-VM-072 | playwright | VM-072 | Playwright: PERSONAL form min_age 70, max_age 60; assert inline error and Save disabled |
| D | QA-VM-073 | playwright | VM-073 | Playwright: enter valid changes, Save; assert 'Draft v2' shown and v2 in list |

## Seam and gate notes

- **Clock (E1-S1-AC1, AC3):** an injectable `Clock` protocol in the Types layer, injected through the app factory. This is an E1-S1 implementation detail and is not in `specs/design/`. Tests advance a fake Clock to issue a token and then age it past 1800 s (1801 s for AC3).
- **Document storage (E1-S3-AC4):** no storage port exists (metadata only). AC4 is tested through the documents API plus captured logs.
- **Test-only route `/api/_test/boom` (E1-S3-AC5):** `TRUELEND_ENV` is read in the Config layer. The app factory registers `/api/_test/boom` only when it equals `test`; any other value or an unset variable leaves the route unregistered (404). The route requires an ADMIN token, so it also satisfies E1-S1-AC5 (VM-005, which enumerates the route table in the test environment). QA-VM-014 calls it with an ADMIN token and expects 500; QA-VM-014-NT starts the app without `TRUELEND_ENV=test` and expects 404. This is an implementation detail and is not in `specs/design/`.
- **Evaluator environment:** the evaluator must start the app with `TRUELEND_ENV=test` for every check except QA-VM-014-NT, which starts it with the variable unset.
- **Added API checks:** QA-VM-012..015 cover E1-S3-AC3, AC4, AC5 and E1-S4-AC1 at API level, in addition to their unit layers.
- **Obligation grounding:** `trace-check.js` against `obligation-index.json` reports 213/213 obligations covered but 32 FRD-traced rows as net-new. This is an id-set mismatch (those rows trace to FRD ids absent from that index), not missing coverage. The AC-level grounding gate (73/73) is authoritative.

## What Is Explicitly Untested (and why)

| Area | Reason |
| --- | --- |
| Real Anthropic AI gateway | Optional and backend-only; system must work with AI off, no story covers it |
| Visual polish / aesthetics | Judged by design-critic at /evaluate, not an AC |
| Load and p95 SLO | Runtime-SLO sensor owns it, no AC |
| EMI, schedules, disbursement | Outside the 16 M1 stories |
| Real PAN/Aadhaar/salary documents | Synthetic data only by project rule |

## Test Levels

- **unit** / **api** / **e2e** as tagged on each matrix row. Unit rows stay on the seam; they are not evaluator checks.

