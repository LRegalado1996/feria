# FER-001 Bootstrap the repo from the template

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** done
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
- The template's base branches are `qa` and `production`; here they are `qa` and `main`. Rename every reference in workflows, scripts, policy tests, skills and docs.
- Merge this repo's `.github/pull_request_template.md` and `pr-visual-proof.yml` with the template's: keep the template's PR sections, and make its "Visual proof" section a gate (it says "not a gate" there), with the "No visible change" checkbox the check reads.
- Commit the template on a branch and merge it into `qa` by PR, then create the GitHub repository (private) and push.

## Out of scope

Removing the posts demo (FER-012). Any product code.

## Acceptance criteria

- `pnpm wt:provision && pnpm db:seed && pnpm dev` serves the template's demo locally.
- `pnpm verify && pnpm build` and `pnpm verify:ci` pass.
- No remaining mention of "template" as the product name outside historical notes.
- `qa` and `main` stay protected (pull requests only, `visual-proof` required), and the checks the template's CI adds are added to the required list.

## Notes

The zip is a snapshot of the template's `qa` branch. Record its commit id (shown in the archive comment) in the README so later template updates can be diffed against it.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
