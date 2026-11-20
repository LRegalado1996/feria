# FER-066 One limit on a page's blocks, on every path that adds one

- **Milestone:** M3 Admin
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-058, FER-059

## Goal

A page can never hold more blocks than its order can save.

## The problem

Raised by CodeRabbit on #68 (FER-020) and #75 (FER-059). The order's save refuses more than `SECTIONS_MAX` (200) blocks, but placing a banner or a spotlight between rows, and adding a category (whose row joins the home), add a block without that check. A page that reached the limit that way could no longer have its order saved, and the admin would only see the generic error. Out of reach today (the store has a few dozen categories), so not urgent.

## Scope

- Choose the limit (a product decision; 200 today).
- Every path that adds a block (banner, spotlight, category on the home, "Agregar bloque" from FER-060) refuses past it, before writing anything, with a message the sheet shows.

## Acceptance criteria

- The limit-th block is accepted and the next refused on each path, unit and integration tested.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
