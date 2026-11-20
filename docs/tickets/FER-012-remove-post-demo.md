# FER-012 Remove the posts demo

- **Milestone:** M2 Core domain
- **Priority:** P1
- **Status:** done
- **Depends on:** FER-010, FER-013

## Goal

The template's demo is gone and the catalog is the reference implementation the docs point to.

## Scope

- Delete the `post` table (with a migration), service, router, schemas, hooks, components and e2e specs.
- Replace the "Good examples to follow" list in `AGENTS.md` with catalog files: a router, a service, a procedure test, a form, a hook.
- `/` stops showing the demo's sign-in and feed and redirects to the store (carried from FER-013); [FER-038](FER-038-single-store.md), next in the stack, makes `/` the store's home.
- Update `README.md`, `docs/agents/` and the seed so nothing mentions posts.

## Acceptance criteria

- `pnpm verify`, `pnpm verify:ci` and `pnpm build` pass; knip reports nothing unused.
- A search for "post" in `src/` and the docs finds only unrelated uses of the word.

## Notes

Done after the catalog and admin shell exist, so the examples are never missing while work is in flight.

## Outcome

- Gone: the posts service, router, schemas, hooks and their tests; `molecules/post-card`, `molecules/compose-box`, `organisms/post-feed` and `organisms/navbar`, and what only they used (`atoms/avatar`, `atoms/text-skeleton`, `atoms/textarea`, `molecules/row-actions`, `getGravatarUrl`, `getInitial`); `molecules/field`, which nothing had used since the template; the dictionaries' `post` area, `auth.welcome` and `common.userFallbackName`; the post e2e specs, `HomePage` and the fixture that tracked posts created through the UI. A shadcn primitive a later screen needs (a textarea for the article wizard) is added again then.
- **The table stays one release.** `post` left the Drizzle schema, but migration `0011` only marks it unused: the build a deploy replaces still reads it while the migration runs (`docs/agents/database.md` § Migrations). [FER-041](FER-041-drop-unread-schema.md) drops it once no deployed build reads it.
- `/` sends the visitor to the default store (`store.isDefault`), in the language of the address, and renders the not-found page when no store is the default. The store is read by `getDefaultStore()` (`src/server/cache/store.ts`), cached under its own tag and dropped by every store edit, since an edit is what moves the mark. Both answers come inside the page's `<Suspense>`, after the shell streamed, so the redirect happens in the browser and the not-found page carries a 200 (`docs/agents/nextjs.md` § Layouts and pages). [FER-038](FER-038-single-store.md) makes `/` the store's home.
- "Good examples to follow" in `AGENTS.md` points at the categories: router, service, procedure test and two-writer test, the catalog schemas and tables, the category form, and the category and order hooks.
- The specs that ran on the demo's home run on the admin: sign-in, sign-out, closed sign-up, languages, theme, brand and hydration. The canonical and `hreflang` check runs on a store's home, and the relative-time hydration check on the orders list, the screen that now prints times relative to its render.
- A search for "post" in `src/` and the docs finds the word only in other senses, plus the migrations and their snapshots, which keep the table's history until FER-041.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
