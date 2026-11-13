---
name: create-pr
description:
  Use this skill when asked to create a pull request (PR). It ensures all PRs
  follow the repository's established templates and standards.
---

# Create a Pull Request

This skill guides the creation of high-quality Pull Requests that adhere to the
repository's standards.

## Workflow

Follow these steps to create a Pull Request:

1.  **Branch Management**: **CRITICAL:** Ensure you are NOT working on a base
    branch. In this repo the base branches are `qa` (the default PR target) and
    `production`. Never commit or push to either.
    - Run `git branch --show-current`.
    - If the current branch is `qa` or `production`, you MUST create and switch
      to a new descriptive branch:
      ```bash
      git checkout -b <new-branch-name>
      ```

2.  **Commit Changes**: Verify that all intended changes are committed.
    - Run `git status` to check for unstaged or uncommitted changes.
    - If there are uncommitted changes, stage and commit them with a descriptive
      message before proceeding. NEVER commit directly to a base branch.
      ```bash
      git add .
      git commit -m "type(scope): description"
      ```

3.  **Locate Template**: Search for a pull request template in the repository.
    - Check `.github/pull_request_template.md`
    - Check `.github/PULL_REQUEST_TEMPLATE.md`
    - If multiple templates exist (e.g., in `.github/PULL_REQUEST_TEMPLATE/`),
      ask the user which one to use or select the most appropriate one based on
      the context (e.g., `bug_fix.md` vs `feature.md`).
    - This repo ships `.github/pull_request_template.md`. Fill it; do not
      improvise a structure.

4.  **Read Template**: Read the content of the identified template file.

5.  **Draft Description**: Create a PR description that strictly follows the
    template's structure.
    - **Headings**: Keep all headings from the template.
    - **Checklists**: Review each item. Mark with `[x]` if completed. If an item
      is not applicable, leave it unchecked or mark as `[ ]` (depending on the
      template's instructions) or remove it if the template allows flexibility
      (but prefer keeping it unchecked for transparency).
    - **Content**: Fill in the sections with clear, concise summaries of your
      changes.
    - **No em dashes.** Not one, anywhere in the description. Use a colon, a
      comma, a full stop or parentheses. An em dash is the clearest tell of
      unedited generated prose, and a description nobody edited is a description
      nobody checked. Grep the body for `—` before you create or edit the PR.
    - **Related Issues**: Reference the issue the PR resolves the way the
      project's tracker expects. GitHub Issues: `Fixes #123` in the body. Linear
      or Jira: the issue key (e.g. `ABC-123`) in the title or body; GitHub
      closing keywords do nothing there.
    - **One concern per PR.** If you are about to write "also", stop and split
      the PR instead. When later work depends on unmerged work, stack it with
      the `gh-stack` skill rather than growing one PR.
    - **Model and harness**: end the body with a `Model: … · Harness: …` line:
      the model that wrote most of the change, and the harness it ran in
      (Claude Code, T3 Code, Cursor, Codex, by hand). Keep the template's line
      if it has one, otherwise add it as the last line. Never delete it.

6.  **Preflight Check**: Before creating the PR, run the full check list in
    `AGENTS.md` § Definition of done, exactly as written there (do not copy it
    into this skill, where it would drift). There is no `preflight` script, and
    `npm` is banned in this repo, so use pnpm.

    If any checks fail, address the issues before proceeding to create the PR.

7.  **Push Branch**: Push the current branch to the remote repository.
    **CRITICAL SAFETY RAIL:** Double-check your branch name before pushing.
    NEVER push if the current branch is `qa` or `production`. Never bypass git
    hooks (`--no-verify`).

    ```bash
    # Verify current branch is NOT qa or production
    git branch --show-current
    # Push non-interactively
    git push -u origin HEAD
    ```

8.  **Visual proof**: for a user-facing change, capture the same screen at
    the same size before and after, using `agent-browser` (see
    `docs/agents/agent-tooling.md` § Live testing). Skip it when the change has
    no visual surface; for a backend change, show the behaviour difference
    instead (response, output). Never block the PR on it: if the app will not
    come up, write the reason in one line rather than leaving the section blank.
    - **Before**: the deployed base (`qa`), or this branch with your change
      stashed. It must show the old behaviour.
    - **After**: this branch, served on this worktree's port (`pnpm wt:ports`),
      or the branch's preview deployment.
    - Never commit media into the repo. If your `gh` has no attachment flag
      (`gh pr create --help`), upload the images by dragging them into the PR
      on GitHub, or hand the files to the user and say so in the section.

9.  **Create PR**: Use the `gh` CLI to create the PR against `qa`. To avoid
    shell escaping issues with multi-line Markdown, write the description to a
    temporary file first.
    ```bash
    # 1. Write the drafted description to a temporary file
    # 2. Create the PR using the --body-file flag
    gh pr create --base qa --title "type(scope): succinct description" --body-file <temp_file_path>
    # 3. Remove the temporary file
    rm <temp_file_path>
    ```
    - **Title**: Ensure the title follows the
      [Conventional Commits](https://www.conventionalcommits.org/) format if the
      repository uses it (e.g., `feat(ui): add new button`,
      `fix(core): resolve crash`).

## Principles

- **Safety First**: NEVER push to `qa` or `production`. This is your highest
  priority. Target `qa` unless the change is a production hotfix.
- **Compliance**: Never ignore the PR template when one exists.
- **Completeness**: Fill out all relevant sections.
- **Accuracy**: Don't check boxes for tasks you haven't done.
