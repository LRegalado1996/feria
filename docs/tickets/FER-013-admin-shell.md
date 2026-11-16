# FER-013 Admin shell and sign-in

- **Milestone:** M3 Admin
- **Priority:** P0
- **Status:** in progress
- **Depends on:** FER-009

## Goal

A signed-in person lands in the right place and can move around the admin on a phone or a laptop.

## Scope

- `/admin/sign-in` with email and password, reusing the template's auth form without the sign-up mode.
- `/` stops showing the template's sign-in and redirects to the default store, the one with `store.isDefault` (FER-008 added the column and its one-default rule; it needs a cached read like `getStoreForPath`). With no default store, `/` answers 404. Moved here from FER-008, which left `/` alone because sign-in had nowhere else to live.
- `/admin`: a superadmin sees the platform area; a member of one store goes straight to it; a member of several picks one.
- Layout with navigation for the store area (articles, categories, orders, home, settings, users) and the platform area (stores, users, metrics), a store switcher, the locale toggle, the theme toggle and sign out.
- Auth is checked per page and per procedure, never in the layout, as the template requires.
- Empty states and skeletons for every list the shell links to.

## Acceptance criteria

- An anonymous visit to any `/admin` page ends at sign-in and returns to the requested page afterwards.
- A member never sees platform navigation, and typing a platform URL answers 404.
- Usable at 375 px: the store owner will work from a phone at the stall.
- E2E covers sign-in, sign-out and the three landing cases.

## Outcome

- Pages under `src/app/[locale]/admin/`: `sign-in`, the landing (superadmin to `/admin/platform/stores`, a member of one store to its articles, several to a choice, none to a page that says so), `[store]/[section]` for the six store sections and `platform/[section]` for the three platform ones, each showing "Coming soon" until its ticket lands (FER-014, 015, 016, 019, 020, 027, 030). `platform` and `sign-in` joined the reserved store slugs (migration `0007`).
- Each page checks the session and the store itself (`requireAdmin`, `requireAdminStore`, `docs/agents/nextjs.md` § Admin pages) and renders `organisms/admin-shell` from the answer: a member never gets the platform navigation, and a platform or another store's address renders the not-found page. Its status is 200, not 404: the check runs after the shell streams.
- `admin.me` gives the pages the login's role (read from the database) and the stores it may open; a store page finds its store among them (`requireAdminStore`). The sign-in page sends a login that is already signed in straight to its `next`, in the page's own language.
- **Pending: `/` redirecting to the default store.** `/` still hosts the template's demo (its sign-in and the posts feed, which several e2e specs exercise); redirecting it means removing that demo, which is [FER-012](FER-012-remove-post-demo.md). The redirect lands with FER-012, added at the end of this stack; the ticket stays `in progress` until then.
- E2E (`src/e2e/tests/admin/admin-access.e2e.ts`): the return to the requested page after sign-in, the three landing cases, sign-out, a member on a platform address and on another store's admin, and the shell at 375 px.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
