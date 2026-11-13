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
- Decide which optional workflows stay for a one-person project (CodeRabbit, Dependabot auto-merge, auto-promotion PR) and remove or disable the rest, updating `docs/agents/ci.md` and its policy tests.
- Open a throwaway PR to prove the pipeline end to end, then close it.

## Acceptance criteria

- A PR shows green CI, a preview URL and a Neon branch that is cleaned up when the PR closes.
- An error thrown on purpose in a preview appears in Sentry once, with the environment tagged.
- The environment marker shows on previews and not on production.

## Notes

The template's flow is `qa` then `main`. Confirm with Lucas whether to keep two branches or release from `main` only; adjust the release policy tests accordingly.
