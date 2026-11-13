---
name: review-loop
description: Review a change before and after its pull request until it is ready to merge. Use before opening a PR in this repo (the local round with the agent's own review and the CodeRabbit CLI), after opening or updating one, when asked to address review comments, answer CodeRabbit, check whether a PR can be merged, or "fight it out" with the reviewer.
---

# Review loop with CodeRabbit

CodeRabbit reviews every pull request into `qa`. The local agent answers it.
Neither side is right by default: the goal is a PR that is correct, not a PR
with no comments. Agreeing to end the argument is a failure; so is refusing a
valid point.

The review happens twice, on purpose. A local round before the PR catches what
can be caught cheaply, so the PR opens clean. The round on the PR is the one of
record: a fresh review of what was pushed, argued in the PR's threads, where
Lucas can read it.

## Before the PR: the local round

Run it on the committed branch, after `AGENTS.md` § Definition of done is
green and before `git push`.

1. **The agent's own review.** Review the whole branch against `qa`
   (`git diff origin/qa...HEAD`) as a reviewer who did not write it:
   correctness and security first, then the rules in `AGENTS.md`, `design.md`
   and `docs/agents/`. In Claude Code that is `/code-review`; in another
   harness, its review command or a fresh agent given the diff and not the
   conclusion.

2. **CodeRabbit, locally.** The CodeRabbit CLI reviews the same diff without a
   PR:

   ```bash
   coderabbit review --plain --base qa
   ```

   Install it once with the script on <https://www.coderabbit.ai/cli> and sign
   in with `coderabbit auth login` (it opens a browser, so Lucas does it). The
   CLI is rate-limited: one run per round, not one per file. If it is not
   installed or not signed in, do not skip silently: do step 1, say in the PR
   description's "How it was verified" that the local CodeRabbit round did not
   run, and tell Lucas.

3. **Judge every finding** from both with the verdict table below, exactly as
   on the PR. Fix what is right in new commits, and write down what was refused
   and why: it goes in the PR description's "Review focus", so the reviewer on
   the PR starts from the argument instead of repeating it.

4. **Repeat** while a round still finds something that is right. Two local
   rounds at most; what is still disputed goes to the PR, where it is argued in
   the open.

Then open the PR with the `create-pr` skill.

## On the PR: the loop

1. **Open the PR** into `qa` following the `create-pr` skill. CodeRabbit
   reviews it by itself. If its review does not arrive, or it reviewed an older
   head, ask for one with a PR comment: `@coderabbitai review` (or
   `@coderabbitai full review` to review everything again from scratch).
   Do not poll in a tight loop: check when CI finishes.

   ```bash
   gh pr checks <number> --watch
   gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate
   gh pr view <number> --comments
   ```

2. **Read every comment before changing anything.** Sort them: correctness and
   security first, then behaviour, then maintainability, then style.

3. **Judge each one against the code, not against its tone.** Open the file,
   reproduce the claim, run the test or write one. Then choose:

   | Verdict | What to do |
   | --- | --- |
   | Right | Fix it, with a test that fails without the fix. Reply with the commit SHA and one line on what changed. |
   | Right, but out of scope | Open a ticket with the next `FER` number, reply with its id, leave the code alone. |
   | Wrong | Reply with the evidence: the line, the test, the rule in `AGENTS.md` or the docs that says otherwise. No fix. |
   | Unclear | Ask one precise question in the thread. Do not guess. |

   A suggestion that conflicts with `AGENTS.md`, `design.md` or `docs/agents/`
   loses to those files. Say which rule, so the reviewer learns it. If the same
   wrong suggestion comes back, add the rule to `.coderabbit.yaml` instead of
   arguing twice.

4. **Reply in the thread**, one reply per comment, in English, short and
   specific. Start a reply to the bot with `@coderabbitai` so it reads it.
   Never resolve a thread without a reply that justifies it.

   The argument lives in the PR, never only in the agent's session: every
   verdict, fix and refusal is a comment there.

5. **Push the fixes** as new commits (never amend or force-push a reviewed
   branch) and let CodeRabbit review the new commits. Go back to step 2.

6. **Stop when** every thread is resolved with a fix or an accepted reason, all
   required checks are green, and a visible change has its visual proof.

## Promotion PRs

The PR from `qa` into `main` is not part of this loop. CodeRabbit is configured
to skip it, because every change in it was reviewed in its own PR. Do not wait
for a review there: check that the required checks are green, that `qa` is
stable, and ask Lucas for the go-ahead.

## Limits

- **Three rounds** on the PR. If a thread is still open after three exchanges,
  stop and bring it to Lucas with both positions in two lines each. He decides.
  The local rounds do not count toward the three.
- **Never** weaken a test, disable a lint rule, lower coverage or mark a thread
  resolved to make the PR green.
- **Never** take a suggested change without understanding it. A suggestion
  applied blindly is an unreviewed change.
- **Merging** is Lucas's call. Report the conclusion (what was fixed, what was
  refused and why, what became a ticket) and merge only when he says so.

## Report format

```
PR #12 feat(catalog): add keyset pagination to the public article list
Local round: own review 2 fixed · CodeRabbit CLI 1 fixed, 1 refused
Rounds: 2
Fixed: 3 (off-by-one on the cursor, missing index, unescaped search term)
Refused: 1 (suggested a JSON column; AGENTS.md bans them)
Ticketed: 1 (FER-035, cache the category counts)
Open: 0 · Checks: green · Ready to merge
```
