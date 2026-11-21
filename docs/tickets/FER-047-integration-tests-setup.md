# FER-047 Integration tests take their rows from `setup()`

- **Milestone:** M0 Foundation
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-043, FER-011

## Goal

`docs/agents/testing.md` asks every test that needs state to take all of it from a `setup()` it calls first. Unit tests do; several integration files do not: their tests read the store and create their rows through helpers on their first lines (`theStoreId`, `uniqueTag`, `add`, `makeStore`). CodeRabbit flagged the FER-043 tests of `src/server/services/category.integration.test.ts` on PR #56 and FER-011's `src/server/services/upload.integration.test.ts` on PR #57; the same file's FER-016 tests, and `catalog`, `store`, `seed` and `better-auth/auth` integration files, are written the same way. Converting one part of a file would leave it in two styles.

## Scope

- In each integration file without one, a `setup()` (or one per `describe`) returns the store, a unique tag, the rows the test needs and the actions on them, and each test calls it first.
- The rows a file creates are still deleted by the ids it captured, and the two-writer helpers (`overlappingCreations`, `overlappingPages`) keep their order of locks.

## Acceptance criteria

- Every test in `src/**/*.integration.test.ts` that needs rows calls `setup()` on its first line.
- No assertion changes; `pnpm test:integration` passes.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
