# BRD: TrueLend — Product Requirements (BC-AINE-003)

Mode: `--prd` adopt-only. Source: `specs/prd.md` (copied to `specs/brd/source-frd.md`).
Spine: `specs/brd/brd-requirements.json` — **28 requirements**, adopted verbatim. Do not restate them here.

## In scope

28 adopted requirements. Machine spine + acceptance: `brd-requirements.json`, `brd-acceptance.json`.

## Out of scope

- Real bureau or credit-score integration.
- Real document OCR or extraction; document upload records metadata only and stores no file content.
- Real disbursement rails (NEFT, RTGS, IMPS); the response is stubbed.
- Real collections or recovery workflow.
- Multi-currency and foreign exchange; all amounts are INR.
- Production deployment, secret management, multi-region operation and distributed locking.
- Late fees, penal interest, prepayment rebates, foreclosure quotes, and schedule regeneration or restructuring.
- Co-applicants, editing an application after submission, and withdrawing an application.
- Token refresh, password reset, and user administration.
- A fourth product type, editing score weights through the policy editor, and rolling back an approved policy version.
- Report export, time-series trends and notifications.
- Any requirement that depends on the optional AI runtime; every FR must be met with that runtime off.

## Open questions

- none

## Clarifications

- none — lean adopt does not invent decisions the PRD did not ask

## Risks

- none listed in the PRD

## Gates

- Grounding and taxonomy are the scripts in Step 4.4 / 4.45 — not a restated analysis pack.
- No `brd-analysis.json`. Domain/risk seed: `analysis-seed.json`. SPDD Canvas is a `/design` artifact.
