---
name: truelend-domain
description: Use when writing or reviewing TrueLend code that computes or stores money (principal, interest, EMI, balances), reads or writes policy versions or policy files, or records an audit entry. Not for UI styling or generic FastAPI/React questions.
---

# TrueLend domain invariants

These three areas break NFR-01, NFR-02 and NFR-04 when done casually. The values and exact rules are settled in the feature specs; this skill says where to look and what to keep true.

## Where the rules live

| Topic | Source of truth |
|---|---|
| Money format and storage | `specs/features/F0-platform.md` FA-F0.1 |
| EMI formula, rounding, schedule rows, due dates, buckets | `specs/features/F4-repayment-disbursement.md` FA-F4.1 to FA-F4.9 |
| Policy lifecycle, active version, policy migrations | `specs/features/F1-product-catalog.md` FA-F1.2 to FA-F1.5 |
| Audited actions, audit row, append-only enforcement | `specs/features/F0-platform.md` FA-F0.4, FA-F0.9, story E0-S2 |
| Score formula and decision rules | `specs/features/F3-underwriting.md` FA-F3.2 to FA-F3.4 |

## Money

<money>
- `Decimal` everywhere in code; amounts are strings with exactly 2 decimals in JSON; SQLite holds text or integer paise, never `REAL`.
- Round with `ROUND_HALF_UP` to 2 places at the points FA-F4.2 names, not earlier. Keep one money helper module and route every calculation through it.
- Build a `Decimal` from a string or an integer, never from a `float`.
- Anything that parses money from JSON must use a decimal-aware parse so a bare number never becomes a float.
</money>

## Policy versions

<policy>
- A version file `backend/policies/policy_v000N.json` is written once and never edited. A change is a new version.
- Status moves only `DRAFT` to `APPROVED`, recorded in the database; the file and its SHA-256 do not change.
- The active version is the highest-numbered `APPROVED` one at submission, and the application stores it (`policy_version`). Underwriting reads the stored version, not the current one.
- No `PUT`, `PATCH` or `DELETE` route on `/api/policies*`.
</policy>

## Audit

<audit>
- Audit exactly the nine actions in FA-F0.4; customer actions and automated decisions are not audited.
- Write the audit row in the same transaction as the action, so a failed action leaves no row.
- A row carries actor user ID and role, UTC timestamp, correlation ID, entity, and for overrides and reviews the reason code, comment and before/after status.
- `audit_log` and `schedule_rows` are insert-only: no update or delete code path, plus triggers that abort both.
</audit>

## Gotchas

- `PolicyViolationException` comes from the rule engine; the underwriting service catches it and persists `AUTO_REJECT` with `INCOME_BELOW_MIN`. The API returns 200, not an error.
- Schedule rows carry no dates. Due dates are derived from `disbursed_on`, which keeps the rows immutable.
- A bucket is computed from an explicit `as_of` date; never read the system clock inside the bucket function.
