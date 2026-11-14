# FER-013 Admin shell and sign-in

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-009

## Goal

A signed-in person lands in the right place and can move around the admin on a phone or a laptop.

## Scope

- `/admin/sign-in` with email and password, reusing the template's auth form without the sign-up mode.
- `/` stops showing the template's sign-in and redirects to the store whose slug is in `DEFAULT_STORE_SLUG` (validated in `src/env.js`, documented in `.env.example`). Moved here from FER-008, which left `/` alone because sign-in had nowhere else to live.
- `/admin`: a superadmin sees the platform area; a member of one store goes straight to it; a member of several picks one.
- Layout with navigation for the store area (articles, categories, orders, home, settings, users) and the platform area (stores, users, metrics), a store switcher, the locale toggle, the theme toggle and sign out.
- Auth is checked per page and per procedure, never in the layout, as the template requires.
- Empty states and skeletons for every list the shell links to.

## Acceptance criteria

- An anonymous visit to any `/admin` page ends at sign-in and returns to the requested page afterwards.
- A member never sees platform navigation, and typing a platform URL answers 404.
- Usable at 375 px: the store owner will work from a phone at the stall.
- E2E covers sign-in, sign-out and the three landing cases.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
