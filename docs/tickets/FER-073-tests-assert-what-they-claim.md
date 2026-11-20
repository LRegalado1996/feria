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

## Scope

- A ratchet on argument-blind spy assertions (`scripts/ratchets.json`, baseline from today's count), then drain it file by file with exact arguments.
- Integration files move to test-owned pages, banners and categories (with [FER-047](FER-047-integration-tests-setup.md)'s `setup()`), deleting by captured ids.

## Acceptance criteria

- The ratchet holds the count at or below today's and reaches zero; no integration test deletes or rewrites a row it did not create.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
