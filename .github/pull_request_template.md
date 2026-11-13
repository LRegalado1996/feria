<!--
The title is a Conventional Commits message: it becomes the commit on the base
branch. See .agents/skills/conventional-commits/SKILL.md.
Target `qa`. Only the promotion PR from `qa` targets `main`.

Write for a reviewer who has not seen the work. Code, commits, branch names and
test titles stay in English; the description may use the language the team
reviews in.

No em dashes anywhere in the description: use a colon, a comma, a full stop or
parentheses. They are the clearest tell of unedited generated prose, and a
description nobody edited is a description nobody checked.

Delete a section only when it does not apply, and say why. A blank section
reads as "not considered".
-->

## In plain language

<!-- What changes for the person using the app, in a short paragraph without
     jargon. If you cannot say it plainly, the PR is probably doing two things. -->

## What changed

<!-- One topic. If this paragraph needs an "also", split the PR. The summary
     block at the top counts production lines; at 500 or more (size:XL and
     up), say here why the change cannot be split. -->

## Why

<!-- The problem, and why this approach rather than the obvious alternative.
     A bug that reached users: quantify what it did. A rule you tighten or
     loosen (validation, authorization, a guard): measure it against real
     data first and give the numbers. Say what you could not establish. -->

## Ticket and footers

<!-- Conventional Commits footers, one per line: `Closes: FER-0xx` on the PR
     that finishes the ticket, `Refs: FER-0xx` otherwise, and any
     `BREAKING CHANGE: ...`. `None` when there is no ticket. -->

## Blast radius

<!-- What this can break, including surfaces you did not touch that share the
     code you changed. Name what is deliberately out of scope. If merging does
     not cut over by itself (an env var to set, a backfill to run, a manual
     step), give the order of operations and the rollback. -->

## How it was verified

- [ ] Unit tests added or updated next to the code, covering the error and edge branches
- [ ] E2E coverage for user-facing behaviour, or `N/A` with a reason
- [ ] Errors and edge cases handled, not only the happy path
- [ ] No new security issue (OWASP Top 10); authorization covered in the risk sweep
- [ ] `AGENTS.md` § Definition of done checks green, plus `pnpm test:integration` when database or auth code changed
- [ ] Documentation this change makes stale is updated here (`AGENTS.md`, `docs/agents/`, README), or `N/A`

<!-- A bug fix states the reproduction and how often it reproduced, before and
     after. For a flaky test, the repro rate before and after is the proof. -->

## Falsifiability

<!-- Required. Revert the production change and say what goes red, by name.
     A test that passes with and without the fix documents nothing. If a test
     stays green on purpose, say which one and why. -->

## Visual proof

<!-- Required when the change is visible: a screenshot of the result, at mobile
     and desktop width when layout changed, before and after of the same
     screen at the same size, and a recording for a gesture or a timing. Drag
     the files into this description; never commit media.
     It is a gate: the `visual-proof` check fails when the PR touches files
     that affect the interface and this description has neither an image or a
     recording nor the box below ticked. -->

- [ ] No visible change (say why in one line)

## Risk sweep

<!-- One line each, or `N/A`. These are the classes that ship broken, so the
     sweep is the point, not the checkbox. -->

- **Authorization scope:** every id from input is checked against the session user before a query uses it; the actor comes from the session
- **Migrations & backfills:** idempotent, fill-only, guarded against populated tables, and compatible with the deployment still serving
- **Multi-step consistency:** derived values re-read inside the write transaction; rows read then written under contention locked first
- **Errors observable:** nothing swallowed; expected failures are typed errors; logs carry ids and enums, never free text or personal data
- **Accessible markup:** labelled inputs, toggle state (`aria-pressed`), current step or page (`aria-current`), named icon-only controls, no nested interactives
- **Performance & DB:** no new unindexed filter on a growing table, no query per row in a loop

## Review focus

<!-- The judgement call you want checked: where a reasonable reviewer could
     disagree with you. It is worth more than the diff. -->

<details>
<summary>AI prompt (optional)</summary>

<!-- If an AI agent wrote most of this, paste the prompt you started it with:
     it shows reviewers the intent behind the generated code. -->

</details>

---

<!-- The model that wrote most of this change and the harness it ran in
     (Claude Code, T3 Code, Cursor, Codex, by hand). Reviewers calibrate on it. -->

Model: · Harness:
