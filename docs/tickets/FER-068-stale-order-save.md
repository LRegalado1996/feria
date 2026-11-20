# FER-068 Saving a page's order from an old screen asks first

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-058, FER-059

## Goal

An order saved from a screen opened before something was added never moves what was added without the owner seeing it.

## The problem

Raised by CodeRabbit on #75 (FER-059). The order's save sends the whole sequence; what the server holds and the screen did not list (a banner or a spotlight added from another tab or by another admin) is placed after the rest. The screen in the same tab already follows a refreshed page (FER-020's review), but a second tab or a second admin does not, so a block placed first by one ends up last after the other saves.

## Scope

- A version for the page's order (a counter on `page`, bumped by every write under the pages' lock), sent with the order and checked on save; a stale save is refused with a message that reloads the order, keeping the owner's moves where they still apply.

## Acceptance criteria

- Two editors open on one page: the second save after the first answers "the order changed" and nothing is written; integration and e2e tested.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
