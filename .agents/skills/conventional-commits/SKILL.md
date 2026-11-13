---
name: conventional-commits
description: Write commit messages, PR titles and PR descriptions for this repo following Conventional Commits 1.0.0. Use whenever committing, amending a message, opening or retitling a pull request, squash-merging, or reviewing whether a message is valid.
---

# Conventional Commits in this repo

Every commit on every branch, and every pull request title, follows
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
PRs are squash-merged, so the PR title becomes the commit on `main`: it must be
a valid message on its own.

## Format

```
<type>[(scope)][!]: <description>

[body]

[footers]
```

- **type**: required, lowercase, from the table below.
- **scope**: optional, one noun in parentheses, from the scope list below.
- **!**: marks a breaking change. Goes right before the colon.
- **description**: required. Follows the colon and one space. Imperative mood
  ("add", not "added" or "adds"), lowercase first letter, no full stop, and the
  whole first line stays at 72 characters or fewer.
- **body**: optional, one blank line after the first line. Says why the change
  was needed and what is different now. Wrap at 72 characters.
- **footers**: optional, one blank line after the body. Each is
  `Token: value`, with hyphens instead of spaces in the token
  (`Reviewed-by`, `Refs`, `Co-Authored-By`). `BREAKING CHANGE` is the one token
  allowed to contain a space.

English only, like everything else in the repo.

## Types

| Type | Use it for | Version effect |
| --- | --- | --- |
| `feat` | A new capability a user or operator can notice | minor |
| `fix` | A bug fix | patch |
| `docs` | Documentation, tickets and plans only | none |
| `style` | Formatting with no change in behaviour | none |
| `refactor` | Restructuring with no change in behaviour | none |
| `perf` | A change whose purpose is speed or resource use | none |
| `test` | Adding or correcting tests only | none |
| `build` | Dependencies, bundler, package manager | none |
| `ci` | Workflows, hooks, pipeline scripts | none |
| `chore` | Maintenance that fits nothing above | none |
| `revert` | Reverting an earlier commit | depends |

Pick by what the change does for the person using the product, not by which
files moved. A feature that ships with its tests and docs is one `feat`. If no
single type is honest, the commit is doing two things: split it.

## Scopes

Use the area a reader would look for. Leave the scope out when a change spans
several.

`store` · `catalog` · `orders` · `checkout` · `admin` · `storefront` · `ai` ·
`auth` · `i18n` · `brand` · `design` · `metrics` · `uploads` · `db` · `deps` ·
`tickets`

Add a scope to this list in the same PR that first needs it.

## Breaking changes

A change is breaking when something that worked stops working without action:
a removed or renamed route, a changed API contract, a migration that needs a
manual step, a renamed environment variable.

Mark it with `!`, with a `BREAKING CHANGE:` footer, or both. The footer says
what breaks and what to do about it.

```
feat(store)!: require a currency on every store

BREAKING CHANGE: `store.currencyCode` is now required. Run the 0007
migration before deploying; stores without a value are set to UYU.
```

## Tickets and other footers

- Reference the ticket in a footer: `Refs: FER-017`. Use `Closes: FER-017` on
  the PR that finishes it. Never put the ticket key in the description line.
- Keep the attribution footer the harness asks for (`Co-Authored-By: ...`) as
  the last line. It is an ordinary footer and is valid under the spec.

## Reverts

```
revert: add curated ranking to the home

Refs: 676104e
```

The description repeats the reverted commit's description; the footer carries
its SHA. The body says why.

## Examples

```
feat(catalog): add keyset pagination to the public article list
```

```
fix(checkout): create one order when the form is submitted twice

The submit button stayed enabled while the request was in flight, so a
double tap created two orders with the same items.

Refs: FER-026
```

```
docs(tickets): add the project plan and the first 32 tickets
```

```
build(deps): bump drizzle-orm to 0.45.5
```

Not valid, and why:

| Message | Problem |
| --- | --- |
| `Added product wizard` | No type, past tense |
| `feat: Add wizard.` | Capital letter and full stop |
| `feat(FER-017): wizard` | Ticket used as scope; description says nothing |
| `fix:missing space` | No space after the colon |
| `update stuff` | No type, no information |

## Pull requests

- **Title**: a valid message first line, as above. It is what lands on `main`.
- **Description**: fill `.github/pull_request_template.md` when it exists. The
  parts of a commit body still apply: why, what changed, how it was checked. End
  with the footers: `Closes: FER-0xx`, any `BREAKING CHANGE:`, and the
  attribution line the harness asks for.
- **Commits inside the PR** follow the same format even though they are
  squashed: they are what a reviewer reads.
- One ticket, one PR, one type. A PR that needs "and" in its title is two PRs.

## Before you commit or open a PR

1. Read the staged diff (`git diff --staged`) and name the one thing it does.
2. Choose type and scope from the tables. Decide whether it is breaking.
3. Write the first line and count it: 72 characters or fewer.
4. Check it against this pattern:
   `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: [a-z0-9].*[^.]$`
5. Add the body when the reason is not obvious from the first line, then the
   footers.
6. Never use `--no-verify`, never amend a pushed commit, never force-push
   `main`.
