# FER-003 CI, preview deployments and error reporting

- **Milestone:** M0 Foundation
- **Priority:** P0
- **Status:** in progress
- **Depends on:** FER-002

## Goal

Every PR gets the template's full pipeline: checks and a preview deployment on its own database branch. Errors in QA and production are reported to Sentry.

## Scope

- Add the GitHub secrets and variables the workflows read (Vercel, Neon, Sentry). `docs/agents/ci.md` lists them.
- Before the first preview: in Vercel, turn on "create a database branch per preview deployment" for the `feria-db-qa` Neon resource (left by FER-002). Without it a preview build migrates the QA database. `NEON_PROJECT_ID` is that resource's project.
- Slack: Lucas installs the GitHub app for Slack and subscribes `#feria-prs` to this repo's pull requests only (the app's default subscription also includes deployments, issues, commits and releases: turn those off, or each deployment shows up in both channels), and the Vercel app and points its deployment notifications at `#feria-deploys`, so those events post themselves. From then on the integrations own "PR opened", "PR merged" and every deployment message, and the agent posts one of those only when an app missed it: update the ownership table in the `slack-reporting` skill in the same PR. Add a Slack connector to Claude Code so the agent's own reports no longer go through the browser.
- Create the Sentry project and set its DSN and auth token per environment.
- CodeRabbit reviews every PR into `qa`. The promotion PR from `qa` into `main` and the merge-back from `main` into `qa` are the exceptions: they only carry changes already reviewed in their own PRs. Lucas installs the GitHub app on this repo (14-day free trial from the install date; decide before it ends whether to keep it, and write the date here). Adapt the template's `.coderabbit.yaml` to this project: point it at `AGENTS.md`, `design.md` and `docs/agents/` so its suggestions follow our rules, and have it review PRs into `qa` and skip the promotion PR into `main`.
- The local agent answers CodeRabbit following the `review-loop` skill. Prove the loop on the first real PR.
- Decide which other optional workflows stay for a one-person project (Dependabot auto-merge, auto-promotion PR) and remove or disable the rest, updating `docs/agents/ci.md` and its policy tests.
- Open a throwaway PR to prove the pipeline end to end, then close it.

## Acceptance criteria

- A PR shows green CI, a preview URL and a Neon branch that is cleaned up when the PR closes.
- An error thrown on purpose in QA appears in Sentry once, tagged with the environment `qa`. A pull request's preview reports nothing (§ Outcome).
- The environment marker shows on previews and not on production.

## Notes

Decided: two branches, `qa` then `main`, both protected. Keep the template's auto-promotion PR from `qa` to `main`, and choose the merge method for promotions so the two branches never diverge (a squash would).

## Outcome

Decisions, taken with Lucas on 2026-11-13:

- **Every optional workflow stays.** The auto-promotion PR, Dependabot auto-merge, the opt-in preview deployment and the Neon cleanup and prune all run as the template ships them, so `docs/agents/ci.md` gained their caveats and its policy tests needed no change.
- **No GitHub App.** The promotion PR is opened with the workflow's own token, which needed the repository setting "Allow GitHub Actions to create and approve pull requests" (now on; the workflow failed on every push to `qa` without it). The cost: close and reopen each promotion PR to start its checks, and a Dependabot auto-merge leaves `qa` without a push CI run until the next merge (`docs/agents/ci.md` § Releases).
- **Promotions merge with a merge commit**, as the template says: a squash would make the branches diverge.
- **Sentry reports production and QA only.** A pull request's preview stays silent, as the template designs it (`docs/agents/observability.md` § Sentry), so the "error thrown on purpose" criterion is proven on QA, which is Vercel's Preview environment on the `qa` branch and reports as `qa`.
- **CodeRabbit** posted its first review on PR #1 on 2026-11-13, so the 14-day trial ends on 2026-11-27 at the latest (the exact install date is on its dashboard): decide before then whether to keep it. `.coderabbit.yaml` now reads `AGENTS.md`, `design.md` and `docs/agents/` as review criteria and skips releases and merge-backs by title.

Set up outside the repository:

- GitHub: the variables `VERCEL_PROJECT_ID` and `VERCEL_TEAM_ID`; the `preview` environment limited to `qa`; Actions allowed to create pull requests.
- Vercel: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG` and `SENTRY_PROJECT` on Production and on the `qa` branch, pointing at the Sentry project `feria` (organization `pepe-sas-uy`).

Still open, each needing Lucas at a dashboard (the command-line sessions are not allowed to create these credentials):

- `VERCEL_PREVIEW_TOKEN`: a Vercel token scoped to the `feria` project, stored as a secret of the GitHub environment `preview`.
- `NEON_API_KEY` (secret) and `NEON_PROJECT_ID` (variable) in GitHub, from the `feria-db-qa` Neon project, and "create a database branch per preview deployment" turned on for it in Vercel.
- `SENTRY_AUTH_TOKEN` in Vercel, on Production and on the `qa` branch, so builds upload source maps.
- The GitHub and Vercel apps for Slack. Until they post by themselves the agent keeps posting every event, and the ownership table in the `slack-reporting` skill stays as it is.
- With those in place: the throwaway PR (green CI, a preview URL, a Neon branch deleted on close) and the error thrown on purpose in QA.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
