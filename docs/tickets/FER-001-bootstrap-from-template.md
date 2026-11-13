# FER-001 Bootstrap the repo from the template

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** todo
- **Depends on:** nothing

## Goal

The repo holds the Streaver Template, renamed for this project, and every check passes on a clean clone.

## Scope

- Unpack `template-qa.zip` into the repo root, keeping `docs/project/` and `docs/tickets/`.
- Rename the project (`package.json` name, README title and badges, database name in `.env.example` and the compose files, Sentry project placeholders).
- Rewrite the README intro for this product and link the project overview. Keep the architecture sections that still hold.
- Fill in `design.md` § Philosophy with who uses the product: fair shoppers on a phone, store owners loading articles.
- Add `docs/project/` and `docs/tickets/` to the "Where things are documented" table in `AGENTS.md`.
- Reconcile the template's `git-commit` and `create-pr` skills with this repo's `conventional-commits` skill: one source for types, scopes and the ticket footer, and the other two point to it. Add the `.claude/skills` symlinks the template uses for the rest.
- Commit the template on a branch and merge it into `main` by PR, then create the GitHub repository (private) and push.

## Out of scope

Removing the posts demo (FER-012). Any product code.

## Acceptance criteria

- `pnpm wt:provision && pnpm db:seed && pnpm dev` serves the template's demo locally.
- `pnpm verify && pnpm build` and `pnpm verify:ci` pass.
- No remaining mention of "template" as the product name outside historical notes.
- The repo is on GitHub with `main` protected the way `docs/agents/ci.md` describes.

## Notes

The zip is a snapshot of the template's `qa` branch. Record its commit id (shown in the archive comment) in the README so later template updates can be diffed against it.
