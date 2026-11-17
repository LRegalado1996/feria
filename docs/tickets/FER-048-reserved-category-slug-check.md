# FER-048 The database refuses a category on a reserved path

- **Milestone:** M2 Core domain
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-043, live in qa and in production

## Goal

A category's slug is its page's address ([FER-043](FER-043-category-groups-and-pages.md)), so it is never a path the site already answers (`RESERVED_CATEGORY_SLUGS`, `src/lib/schemas/catalog`). Since FER-043 the service holds that rule for every new category, and migration `0015` renamed the categories that already held such a slug. The database does not refuse one yet: the build FER-043 replaced still served while `0015` ran, and it can still create "Productos" as `productos`, so a check added in the same release would have failed its inserts (`docs/agents/database.md` § Migrations: expand → contract). CodeRabbit asked for the order on PR #56. This ticket is the contract step.

## Scope

- In the Drizzle schema, `category_slug_not_reserved`: `slug NOT IN (…)` built from `RESERVED_CATEGORY_SLUGS`, as `attribute_slug_not_reserved` is built from its list.
- Its migration from `pnpm db:generate`, edited so that it first runs `0015`'s rename again under the same table lock (a row the replaced build wrote during FER-043's deploy is renamed too), then drops the check if it exists and adds it, so it converges when replayed.
- A co-located integration test that seeds every reserved slug and a taken `<slug>-2`, applies the migration twice and asserts the renames and the refusal. Its "is it refused" helper answers `false` only after an insert that succeeded, `true` for this check's violation, and rethrows anything else, so a control case cannot pass on an unrelated error (CodeRabbit, PR #56).
- `docs/project/data-model.md` says the database holds the rule.

## Acceptance criteria

- Runs only once every deployed build, qa and production, creates categories through FER-043's service.
- A category on a reserved path cannot be written by any writer; `pnpm verify:ci` passes.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
