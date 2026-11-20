# FER-073 Tests assert what they claim: exact spies, own rows

- **Milestone:** M0 Foundation
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-047

## Goal

Every test fails when the rule it names is broken (`docs/agents/testing.md` § Falsifiability), and every integration test reads and writes only its own rows.

## The problem

The home stack's reviews (#68 to #76, 2026-11-20) fixed the cases CodeRabbit raised in the files they touched, but the same patterns remain elsewhere:

- **Count-only spies:** `toHaveBeenCalledOnce()` / `toHaveBeenCalledTimes(n)` without the arguments in older files (product wizard, order detail, the cover carousel and others). An argument-blind spy passes with the wrong input.
- **Shared rows in integration tests:** some files delete or rewrite rows of the shared store they did not create (e.g. the home-page migration test empties the store's banners and sections inside a rolled-back transaction, and the page services' two-writer test saves on the shared home page's cover and recreates its rows). Rollback restores them, but the tests do not own what they assert on.
- **Teardown by snapshot in E2E:** the `homeEdit` fixture (`src/e2e/fixtures/store.fixture.ts`) deletes every page `page.list` did not return when the test started, so a page another admin made meanwhile goes too (CodeRabbit on #76). `addPage` already returns its id; the pages `pages.serial.e2e.ts` makes through the admin need theirs captured from the `page.create` response before the teardown can delete by captured ids alone.

## Scope

- A ratchet on argument-blind spy assertions (`scripts/ratchets.json`, baseline from today's count), then drain it file by file with exact arguments.
- Integration files move to test-owned pages, banners and categories (with [FER-047](FER-047-integration-tests-setup.md)'s `setup()`), deleting by captured ids.
- E2E fixtures delete by captured ids: `homeEdit` records the pages its test makes, through `addPage` or the admin's `page.create` response, and deletes only those.

## Acceptance criteria

- The ratchet holds the count at or below today's and reaches zero; no integration test or E2E teardown deletes or rewrites a row it did not create, except the serial E2E fixtures that restore the shared store state their spec changed on purpose (`homeEdit` putting back the hidden articles and banners, the layout, the announcement and the home page; `storeEdit` putting back `STORE_SETTINGS`), which `src/e2e/AGENTS.md` § "Shared state runs alone" allows.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
