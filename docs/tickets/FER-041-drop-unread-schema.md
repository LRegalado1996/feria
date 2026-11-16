# FER-041 Drop what nothing reads any more

- **Milestone:** M2 Core domain
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-012 and FER-038, live in qa and in production

## Goal

The database holds only what the code reads. A change that stops reading a table or a column leaves it in place for one release, because the deploy migrates while the previous build still serves and its open tabs keep calling it (`docs/agents/database.md` § Migrations: expand → stop reading → contract). This ticket is the contract step that follows.

## Scope

- Drop the `post` table. [FER-012](FER-012-remove-post-demo.md) took the posts demo out of the code and the Drizzle schema; its migration `0011` only marks the table unused. Its rows are the demo's and go with it.
- Drop what [FER-038](FER-038-single-store.md) stopped reading: the `store_member` table, and `store`'s `slug`, `isActive`, `isDefault`, `logoUrl`, `colorBackground`, `colorSurface`, `colorForeground`, `colorContrast` and `colorAccent`, which its migration `0012` only made nullable.
- Make `admin` the one value of `user.role` (Lucas, 2026-11-16): every row becomes `admin`, the default too, and the type keeps no other value. FER-038 stopped reading the role, but the build it replaced still told `superadmin` from `member`, so the values could not change in the same release. `USER_ROLES` (`src/lib/schemas/access`) and Better Auth's `role` field follow.

## Acceptance criteria

- Runs only once every deployed build, qa and production, is past the one that stopped reading what it drops.
- Hand-written from `pnpm db:generate --custom` (the Drizzle schema no longer declares any of it), idempotent (`IF EXISTS`), with a co-located integration test that applies it twice and asserts the result.
- `pnpm verify:ci` passes.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
