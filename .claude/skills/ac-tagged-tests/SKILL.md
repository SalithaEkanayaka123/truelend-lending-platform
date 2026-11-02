---
name: ac-tagged-tests
description: Use when writing, renaming or reviewing a test in this repo (pytest, Vitest or Playwright), so every acceptance criterion has at least one findable, correctly named test. Not for choosing what to test beyond the feature specs' test lists.
---

# AC-tagged tests

The brief requires at least one test per acceptance criterion that references its AC identifier. `/ac-trace` finds tests by the conventions below, so a test that does not follow them counts as missing.

## What to tag

The plan is the **AC-tagged test list** at the end of each `specs/features/F*.md`. Use its test names as written. Identifiers come from three families:

- `AC-01..AC-10` and `NFR-01..NFR-08` (the brief), `D-01..D-10` (derived scenarios, `specs/app_spec.md`).
- Story criteria `E{n}-S{m}-AC{k}` from the feature specs.
- `FR-n` in `specs/prd.md` map one-to-one onto AC and D ids (FR-1..FR-10 are AC-01..AC-10; FR-11..FR-20 are D-01..D-10).

## Naming

<naming>
- **pytest:** `test_<ID>_<slug>` where `<ID>` is the primary identifier without its hyphen: `test_AC05_below_min_income_raises`, `test_D04_underwriter_approves_manual_review`, `test_NFR03_pan_aadhaar_never_logged`.
- **Vitest and Playwright:** the title starts with the unhyphenated ID: `it('AC02 tenure error shown inline', ...)`, `test('D07 tiles and charts desktop and mobile', ...)`.
- **Secondary tags** go on one comment line directly above the test: `# tags: AC-05 NFR-04 E3-S3-AC1` (`// tags: ...` in TypeScript). List the hyphenated IDs and every story criterion the test proves.
- One primary ID per test. A test that proves two criteria stays one test with a secondary tag; do not duplicate it.
</naming>

## Where tests go

Backend: `backend/tests/{unit,api,repo,architecture}/` as in the feature specs. Frontend component tests beside the feature in `frontend/src/ui/`; Playwright in `e2e/`. Layer and file-size limits are enforced by the gates.

## Workflow

- Red first: commit or show the failing test before the implementation (`quality.test_discipline: tdd`).
- If a criterion changes, change the spec first, then the test name and tag. Never retag a test to a criterion it does not prove.
- A criterion with no spec-listed test gets one added to that feature spec's test list in the same PR.

<example>
```python
# tags: AC-05 E3-S3-AC1
def test_AC05_below_min_income_raises(personal_policy_v1):
    with pytest.raises(PolicyViolationException) as exc:
        evaluate(income=Decimal("24999.99"), product="PERSONAL", policy=personal_policy_v1)
    assert exc.value.code == "INCOME_BELOW_MIN"
```
</example>
