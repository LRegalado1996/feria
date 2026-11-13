---
name: review-loop
description: Work a pull request through CodeRabbit's review until it is ready to merge. Use after opening or updating a PR in this repo, when asked to address review comments, answer CodeRabbit, check whether a PR can be merged, or "fight it out" with the reviewer.
---

# Review loop with CodeRabbit

CodeRabbit reviews every pull request into `qa`. The local agent answers it.
Neither side is right by default: the goal is a PR that is correct, not a PR
with no comments. Agreeing to end the argument is a failure; so is refusing a
valid point.

## The loop

1. **Open the PR** into `qa` following the `conventional-commits` skill, then
   wait for the review. Do not poll in a tight loop: check when CI finishes.

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

- **Three rounds.** If a thread is still open after three exchanges, stop and
  bring it to Lucas with both positions in two lines each. He decides.
- **Never** weaken a test, disable a lint rule, lower coverage or mark a thread
  resolved to make the PR green.
- **Never** take a suggested change without understanding it. A suggestion
  applied blindly is an unreviewed change.
- **Merging** is Lucas's call. Report the conclusion (what was fixed, what was
  refused and why, what became a ticket) and merge only when he says so.

## Report format

```
PR #12 feat(catalog): add keyset pagination to the public article list
Rounds: 2
Fixed: 3 (off-by-one on the cursor, missing index, unescaped search term)
Refused: 1 (suggested a JSON column; AGENTS.md bans them)
Ticketed: 1 (FER-035, cache the category counts)
Open: 0 · Checks: green · Ready to merge
```
