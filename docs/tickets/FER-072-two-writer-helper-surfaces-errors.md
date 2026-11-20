# FER-072 The two-writer test helper reports the second writer's own error

- **Milestone:** M0 Foundation
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-047

## Goal

When the second writer of a two-writer integration test fails before it waits on the lock, the test fails with that writer's error, at once, instead of polling until it reports a lock wait that never came.

## The problem

Found on 2026-11-20 in the home stack's review: the page services' own wait was fixed there (it stops when the writer settles and rethrows its error), but the shared helper `waitUntilBlockedBy` in `src/server/test/two-writers.ts`, used by the product, order, coming-soon and access integration tests, still polls all its attempts and throws its timeout message, hiding the cause.

## Scope

- `waitUntilBlockedBy` takes the second writer's promise, stops when it settles, and rethrows its rejection; its callers pass it.

## Acceptance criteria

- A deliberately failing second writer makes each of those tests fail with the writer's message, not the timeout.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
