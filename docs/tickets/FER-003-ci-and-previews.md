# FER-003 CI, preview deployments and error reporting

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** todo
- **Depends on:** FER-002

## Goal

Every PR gets the template's full pipeline: checks, a preview deployment on its own database branch, and errors reported to Sentry.

## Scope

- Add the GitHub secrets and variables the workflows read (Vercel, Neon, Sentry). `docs/agents/ci.md` lists them.
- Slack: Lucas installs the GitHub app for Slack and subscribes `#feria-prs` to this repo's pull requests, and the Vercel app and points its deployment notifications at `#feria-deploys`, so those events post themselves. From then on the integrations own "PR opened", "PR merged" and every deployment message, and the agent stops posting them: update the ownership table in the `slack-reporting` skill in the same PR. Add a Slack connector to Claude Code so the agent's own reports no longer go through the browser.
- Create the Sentry project and set its DSN and auth token per environment.
- Decide which optional workflows stay for a one-person project (CodeRabbit, Dependabot auto-merge, auto-promotion PR) and remove or disable the rest, updating `docs/agents/ci.md` and its policy tests.
- Open a throwaway PR to prove the pipeline end to end, then close it.

## Acceptance criteria

- A PR shows green CI, a preview URL and a Neon branch that is cleaned up when the PR closes.
- An error thrown on purpose in a preview appears in Sentry once, with the environment tagged.
- The environment marker shows on previews and not on production.

## Notes

Decided: two branches, `qa` then `main`, both protected. Keep the template's auto-promotion PR from `qa` to `main`, and choose the merge method for promotions so the two branches never diverge (a squash would).

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
