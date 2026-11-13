# FER-012 Remove the posts demo

- **Milestone:** M2 Core domain
- **Priority:** P1
- **Status:** todo
- **Depends on:** FER-010, FER-013

## Goal

The template's demo is gone and the catalog is the reference implementation the docs point to.

## Scope

- Delete the `post` table (with a migration), service, router, schemas, hooks, components and e2e specs.
- Replace the "Good examples to follow" list in `AGENTS.md` with catalog files: a router, a service, a procedure test, a form, a hook.
- Update `README.md`, `docs/agents/` and the seed so nothing mentions posts.

## Acceptance criteria

- `pnpm verify`, `pnpm verify:ci` and `pnpm build` pass; knip reports nothing unused.
- A search for "post" in `src/` and the docs finds only unrelated uses of the word.

## Notes

Done after the catalog and admin shell exist, so the examples are never missing while work is in flight.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
