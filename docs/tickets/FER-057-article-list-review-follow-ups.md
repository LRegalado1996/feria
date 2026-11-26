# FER-057 Follow-ups from the article list's last review round

- **Milestone:** M3 Admin
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-019

## Goal

CodeRabbit's last round on PRs #64 and #65 arrived after the review loop was closed (four rounds, Lucas's word to merge on 2026-11-18). None of its findings was fixed there; they are recorded here so none is lost. Each was checked against the code before being written down.

## Scope

- **A failed `BEGIN` may keep its pool client (the whole app): settle this one before the launch.** It is why the ticket is P1; the rest can follow. drizzle-orm 0.45.4 (`node-postgres/session.js`, `transaction()`) checks a client out of the pool, runs `begin` and only then enters the `try` whose `finally` releases it, so a `BEGIN` that rejects (a dropped connection) skips the release. Every `db.transaction` goes through it: each admin write, the public catalog's snapshot reads and the article list's read. Establish what `pg`'s pool does with such a client (it evicts a client whose connection errored; confirm it for this case with a test against a real pool), then either leave it with that proof written in `docs/agents/database.md`, wrap the transaction so the client is always released, or upgrade drizzle-orm if a release fixes it.
- **A search holding U+0000 fails the read.** `q` passes the schema with a NUL character, `likePattern` keeps it and Postgres refuses it as text, so the list answers the curated 500. Refuse it in the shared search schema (the storefront's search takes the same input) and drop it when the address is read.
- **A failed read of the store's filters shows nothing** in the list's filter sheet: no choices and no error. Show the alert with "Reintentar" the category read already has.
- **A pending search resets the sheet's choices.** When the address changes only because a search typed before opening the sheet lands, the sheet's draft is reset and a value just chosen is lost. Settle it with [FER-056](FER-056-list-search-and-filters-race.md), which decides how the search and the sheet share the address; FER-056's tests also need the search-first order as a case of its own.
- **A superseded page keeps its focus request** when the address that replaced it never settles (it stays pending or fails): drop the request as soon as another address takes over.
- **The table's header names the new order over the old rows** while a sort loads: keep the header on the order of the rows on screen until the new ones arrive.
- **Tests to tighten:** the article's age compares its whole text (`2 hours ago` also matches `12 hours ago`); the wizard's "a value created after discarding" test pins the create call's input (`{ attributeId, nameEn, nameEs, swatchColor }`) instead of counting calls.

## Acceptance criteria

- Each item above is fixed with a test that fails without the fix, or closed here with the evidence that it needs none.

## Outcome

- **A failed `BEGIN`:** confirmed against a real pool: pg's pool never evicts a checked-out client, so 0.45.4 kept the slot for good (the pool's `totalCount` stayed 1 and the next checkout timed out). drizzle-orm 1.0.0-rc.6 fixes it; 1.0 is still a release candidate, so Lucas chose (2026-11-25) to backport its release as `patches/drizzle-orm@0.45.4.patch` (`patchedDependencies` in `pnpm-workspace.yaml`). Every path releases, a dead client with its error, and a failed rollback no longer hides the body's error. Proof: `src/server/db/transaction-release.integration.test.ts` (red without the patch); `docs/agents/database.md` § Connections.
- **U+0000 in a search:** `searchTextSchema` (`src/lib/schemas/search`) refuses it for the storefront's search, the admin's articles and the admin's orders (whose search had the same fault), and `readSearchText` drops it when each address is read.
- **The store's filters failing to load:** the sheet says so with "Reintentar" in their place, as for the categories.
- **A pending search resetting the sheet:** settled with [FER-056](FER-056-list-search-and-filters-race.md), in its own pull request stacked on this one (Lucas, 2026-11-25: one pull request per ticket, both done now).
- **A superseded page's focus request:** dropped as soon as another address takes over, whether or not its answer ever comes.
- **The header over the old rows:** `product.list` answers the order its rows are in (`sort`, `dir`), and the header names that order and starts its links from it.
- **Tests:** the article's age is compared whole, and the wizard's test pins the value it creates.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
