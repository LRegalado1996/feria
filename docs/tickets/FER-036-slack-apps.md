# FER-036 GitHub and Vercel apps post to Slack

- **Milestone:** M0 Foundation
- **Priority:** P2
- **Status:** todo
- **Depends on:** FER-003

## Goal

Pull request and deployment events reach Slack by themselves, so the agent only adds what the apps cannot know.

## Scope

- Lucas finishes the GitHub app for Slack: link his GitHub account, give the app access to this repository, and subscribe `#feria-prs` to its pull requests only (`/github subscribe LRegalado1996/feria pulls`, then unsubscribe issues, commits, releases and deployments).
- Lucas installs the Vercel app for Slack and points the `feria` project's deployment notifications at `#feria-deploys`.
- Update the ownership table in the `slack-reporting` skill: the "Now" column becomes what the apps own.

## Acceptance criteria

- Opening and merging a PR each post one message in `#feria-prs`, written by the GitHub app.
- A QA deployment posts one message in `#feria-deploys`, written by the Vercel app.
- No event is posted twice: the agent replies in the app's thread instead of posting its own "PR opened".

## Notes

Split from FER-003, where both installs were in scope: on 2026-11-14 neither app posted anything for PR #24 or its preview deployment.

## Reporting

Report this ticket in Slack as the `slack-reporting` skill describes. The skill is the only place that says which event goes to which channel and who posts it.
