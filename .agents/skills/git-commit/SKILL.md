---
name: git-commit
description: 'Stage and create a git commit in this repo. Use when the user asks to commit changes, create a git commit, or mentions "/commit". Covers reading the diff, staging a logical group of files, and running the commit safely. The message format (types, scopes, ticket footer) is in the conventional-commits skill.'
license: MIT
allowed-tools: Bash
---

# Git commit

This skill is the mechanics of a commit: what to read, what to stage, how to
run it. The message itself follows the `conventional-commits` skill
(`.agents/skills/conventional-commits/SKILL.md`), the one source for the
format, the types, the scopes and the `Refs: FER-0xx` footer. Read it before
writing the message; nothing from it is repeated here.

## Workflow

### 1. Read the diff

```bash
# If files are staged, use the staged diff
git diff --staged

# If nothing is staged, use the working tree diff
git diff

# Also check status
git status --porcelain
```

### 2. Stage files (if needed)

One logical change per commit. If nothing is staged, stage by path:

```bash
git add path/to/file1 path/to/file2
```

If the index already mixes two changes, `git add` does not help: it only adds.
Unstage what belongs to the other change first (the edits stay in the working
tree), then read the staged diff again:

```bash
git restore --staged path/to/unrelated-file
git diff --staged
```

**Never commit secrets** (`.env`, credentials, private keys).

### 3. Write the message

Follow `conventional-commits` § Before you commit or open a PR: name the one
thing the diff does, pick the type and scope from its tables, count the first
line, add the body and the footers.

### 4. Commit

```bash
# Single line
git commit -m "<type>[(scope)]: <description>"

# With body and footers
git commit -m "$(cat <<'MSG'
<type>[(scope)]: <description>

<body>

<footers>
MSG
)"
```

## Git safety

- NEVER update git config.
- NEVER run destructive commands (`--force`, hard reset) without an explicit
  request.
- NEVER skip hooks (`--no-verify`).
- NEVER commit on or push to `qa` or `main`.
- If a hook fails the commit, fix the cause and create a NEW commit (do not
  amend).
