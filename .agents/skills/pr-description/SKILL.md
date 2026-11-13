---
name: pr-description
description: Write or check a pull request description so every PR in this repo reads the same way. Use when drafting, editing or reviewing a PR description, when the `pr-description` check fails, or when asked what goes in each section of the PR template.
---

# Pull request descriptions

Every PR description in this repo has the same sections, in the same order,
filled the same way. `.github/pull_request_template.md` is the form; this file
says how to fill it. The `pr-description` check fails a PR whose title is not a
Conventional Commits message or whose description is missing a section.

## What it is based on

No international body standardises pull request descriptions. These are the
published conventions the industry treats as the standard, and each one maps
to a part of the form:

| Convention | What it gives us |
| --- | --- |
| [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) | The title, and the footers (`Closes:`, `Refs:`, `BREAKING CHANGE:`). Details in the `conventional-commits` skill. |
| [Git trailers](https://git-scm.com/docs/git-interpret-trailers) | The `Token: value` shape of every footer, so tools can read them. |
| [Google Engineering Practices, "Writing good CL descriptions"](https://google.github.io/eng-practices/review/developer/cl-descriptions.html) | A first line that stands alone, then what changed and why, written for a reader with no context. |
| GitHub's `pull_request_template.md` | One form, loaded into every new PR, so nobody invents a structure. |

## The sections, in order

Keep every heading, exactly as written. A section that does not apply keeps
its heading and says `N/A` with one line on why; a blank section reads as "not
considered", and a deleted one fails the check.

| Section | What goes in it | Length |
| --- | --- | --- |
| **In plain language** | What changes for the person using the app, with no jargon. Lucas reads this one first. | 1 short paragraph |
| **What changed** | One topic. What is different now, by area, not a file list. At 500 production lines or more, why it cannot be split. | 1 paragraph or a short list |
| **Why** | The problem, and why this approach over the obvious alternative. Numbers when a bug reached users or a rule is tightened. | 1 paragraph |
| **Ticket and footers** | `Closes: FER-0xx` or `Refs: FER-0xx`, any `BREAKING CHANGE: ...`, one per line. `None` without a ticket. | 1 to 3 lines |
| **Blast radius** | What this can break, including surfaces not touched. What is out of scope. Order of operations and rollback when merging is not enough by itself. | a short list |
| **How it was verified** | The checklist, ticked only for what was done, then the commands that ran and their result. A bug fix states the reproduction before and after. | checklist + list |
| **Falsifiability** | The production change to revert and the test that goes red, by name. | 1 to 4 lines |
| **Visual proof** | Screenshots or a recording for a visible change (mobile and desktop width when layout changed), or the "No visible change" box ticked with one line on why. A gate: the `visual-proof` check reads it. | images + 1 line |
| **Risk sweep** | One line per class, or `N/A`. | 6 lines |
| **Review focus** | The judgement call a reasonable reviewer could disagree with, and what the local review round refused and why. | 1 short paragraph |

The body ends with the `Model: ... · Harness: ...` line and the attribution
line the harness asks for.

## Style, the same in every PR

- **English**, like the rest of the repo.
- **Written for a reviewer who has not seen the work.** No "as discussed", no
  reference to a chat. Link what the reader needs.
- **Facts, not adjectives.** "30 of 30 e2e specs pass" instead of "thoroughly
  tested". Say what was not verified.
- **No em dashes.** Use a colon, a comma, a full stop or parentheses. Grep the
  body for `—` before posting.
- **Present tense for what the code does now**, past tense for what was run.
- **Code, paths, branches and commands in backticks.**
- **Never edit the summary block** that `pr-summary.yml` keeps at the top.
- **Never commit media.** Images are dragged into the description.

## Before posting

1. Every heading of the template is present, in order.
2. The title passes the pattern in the `conventional-commits` skill.
3. No section is blank; `N/A` carries its reason.
4. Unticked boxes are true, ticked boxes are true.
5. `Model: · Harness:` is filled.

## What is exempt

The two pull requests `auto-promotion-pr.yml` opens (`qa` into `main`, `main`
into `qa`) and the ones bots open (Dependabot) carry their own generated body.
The check lets their bodies through. A promotion's title still follows
Conventional Commits in full. A bot's title is held to the type prefix only
(`chore(deps): ...`): Dependabot capitalises "Bump" and writes long titles, and
neither can be configured.
