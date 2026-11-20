# FER-061 Drop FER-020's home-only placing

- **Milestone:** M2 Core domain
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-058

## Goal

The contract step of [FER-058](FER-058-pages-built-from-sections.md)'s expand → contract: once no deployed build reads them, the tables and columns that placed things on the home before pages existed go.

## Scope

- Drop the table `home_section` and its enum `home_section_kind`.
- Drop `banner.placement` and `banner.coverPosition`, and the enum `banner_placement` (keeping the TypeScript union the banner form and the API use).
- Remove them from the Drizzle schema first, in one release; drop them in the next (`docs/agents/database.md` § Migrations).

## Acceptance criteria

- No migration drops what the build still serving reads; `pnpm db:generate` shows nothing left over afterwards.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
