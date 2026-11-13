# FER-003 CI, preview deployments and error reporting

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-002

## Goal

Every PR gets the template's full pipeline: checks, a preview deployment on its own database branch, and errors reported to Sentry.

## Scope

- Add the GitHub secrets and variables the workflows read (Vercel, Neon, Sentry). `docs/agents/ci.md` lists them.
- Create the Sentry project and set its DSN and auth token per environment.
- CodeRabbit reviews every PR. Lucas installs the GitHub app on this repo (14-day free trial from the install date; decide before it ends whether to keep it, and write the date here). Adapt the template's `.coderabbit.yaml` to this project: point it at `AGENTS.md`, `design.md` and `docs/agents/` so its suggestions follow our rules, and have it review PRs into `qa` and skip the promotion PR into `main`.
- The local agent answers CodeRabbit following the `review-loop` skill. Prove the loop on the first real PR.
- Decide which other optional workflows stay for a one-person project (Dependabot auto-merge, auto-promotion PR) and remove or disable the rest, updating `docs/agents/ci.md` and its policy tests.
- Open a throwaway PR to prove the pipeline end to end, then close it.

## Acceptance criteria

- A PR shows green CI, a preview URL and a Neon branch that is cleaned up when the PR closes.
- An error thrown on purpose in a preview appears in Sentry once, with the environment tagged.
- The environment marker shows on previews and not on production.

## Notes

Decided: two branches, `qa` then `main`, both protected. Keep the template's auto-promotion PR from `qa` to `main`, and choose the merge method for promotions so the two branches never diverge (a squash would).
