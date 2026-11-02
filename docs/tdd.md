# Test-driven development

TDD is mandatory here (`quality.test_discipline: tdd`). Test order, names and tags follow the `ac-tagged-tests` skill; the test list for each feature is at the end of its `specs/features/F*.md`.

## Red, green, refactor

1. **Red.** Pick one acceptance criterion from the feature spec. Write its test using the spec's test name. Run it and confirm it fails for the right reason (a missing behaviour, not a typo or import error). Show or commit the failing test before the implementation.
2. **Green.** Write the least production code that makes the test pass. Run the test, then the rest of the suite.
3. **Refactor.** With the suite green, clean up: names, duplication, functions over 30 lines, files over 300 lines. Do not change behaviour. Run the suite again.
4. Repeat for the next criterion.

Keep refactor and behaviour changes in separate commits so a regression can be traced to one of them.

If a criterion changes, change the spec first, then the test name and tag. Never retag a test to a criterion it does not prove.

## AC-tagged test names

`/ac-trace` finds tests by name, so a test that does not follow these conventions counts as missing.

| Runner | Primary ID in the name | Example |
|--------|------------------------|---------|
| pytest | `test_<ID>_<slug>`, ID without its hyphen | `test_AC05_below_min_income_raises` |
| Vitest | Title starts with the unhyphenated ID | `it('AC02 tenure error shown inline', ...)` |
| Playwright | Title starts with the unhyphenated ID | `test('D07 tiles and charts desktop and mobile', ...)` |

- Identifiers: `AC-01..AC-10`, `NFR-01..NFR-08`, `D-01..D-10`, and story criteria `E{n}-S{m}-AC{k}`.
- One primary ID per test. Extra criteria the test proves go on one comment line directly above it, with hyphenated IDs: `# tags: AC-05 NFR-04 E3-S3-AC1` (`// tags: ...` in TypeScript).

```python
# tags: AC-05 E3-S3-AC1
def test_AC05_below_min_income_raises(personal_policy_v1):
    with pytest.raises(PolicyViolationException) as exc:
        evaluate(income=Decimal("24999.99"), product="PERSONAL", policy=personal_policy_v1)
    assert exc.value.code == "INCOME_BELOW_MIN"
```

## Where tests live

- Backend: `backend/tests/{unit,api,repo,architecture}/`
- Frontend component tests: beside the feature in `frontend/src/ui/`
- End to end (Playwright): `e2e/`

## Coverage

The target is 100% meaningful coverage with an 80% floor.

Backend, from `backend/`:

```bash
uv run --with pytest-cov pytest --cov=src/truelend --cov-report=term-missing --cov-fail-under=80
```

`pytest-cov` is not yet in the dev dependency group, so `--with` adds it for the run. Add it to `pyproject.toml` if you want plain `uv run pytest --cov` to work.

Frontend, from `frontend/`:

```bash
npx vitest run --coverage
```

`@vitest/coverage-v8` is already installed. Set the 80% floor under `test.coverage.thresholds` in the Vitest config if it is not there yet.

## Before a PR

Run `/nfr-check` on the diff and `/ac-trace` to confirm every criterion has a test.
