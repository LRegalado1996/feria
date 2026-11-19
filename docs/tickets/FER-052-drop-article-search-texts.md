# FER-052 Drop an article's own search texts

- **Milestone:** M2 Core domain
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-017, live in qa and in production

## Goal

An article has no search texts of its own any more (Lucas, 2026-11-18, [FER-017](FER-017-article-wizard.md) § Decisions): the article's page reads only its title and description (`articleSearchTexts`, `src/lib/seo/article-metadata.ts`), and the wizard sends `seoTitle` and `seoDescription` as `null` on every save. The `product_translation.seo_title` and `seo_description` columns, and the API's fields that carry them, stay only because the build FER-017 replaces still writes them while the deploy migrates (`docs/agents/database.md` § Migrations: expand → stop reading → contract). This ticket is the contract step.

## Scope

- Release 1 (stop writing): drop `seoTitle` and `seoDescription` from the article's save input (`src/lib/schemas/catalog`), the service's upsert and read (`src/server/services/product.ts`), the factories and the seed. The columns stay.
- Release 2 (contract), once every deployed build is past release 1: drop the two columns from the Drizzle schema and generate the migration (`pnpm db:generate`, `DROP COLUMN IF EXISTS`), read the SQL, commit it.
- A category's search texts (`category_translation`) are a different thing and stay.

## Acceptance criteria

- Release 2 runs only once every deployed build, qa and production, no longer names the columns.
- `pnpm verify:ci` passes after each release.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
