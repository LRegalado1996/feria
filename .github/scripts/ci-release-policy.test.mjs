/// <reference types="node" />
/**
 * The release chain's workflow logic, executed for real against fake APIs and
 * throwaway git repositories:
 *
 *   node --test ".github/scripts/*.test.mjs"
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { coreMock, runScript, runShell, workflow } from "./workflow-step.mjs";

const ci = workflow("ci.yml");
const promotion = workflow("promotion-verification.yml");
const opener = workflow("auto-promotion-pr.yml");

const SHA = /^[0-9a-f]{40}$/;
/**
 * A `setTimeout` that fires at once, so a polling script runs without waiting.
 *
 * @param {() => void} resolve the callback the script scheduled
 * @returns {void}
 */
const immediate = (resolve) => {
  resolve();
};

test("ci.yml validates qa and hotfix pushes and leaves production PRs to the verifier", () => {
  assert.match(ci, /push:\n {8}branches: \[qa, "hotfix\/\*\*"\]/);
  assert.match(ci, /pull_request:\n {8}branches-ignore: \[production\]/);
});

test("the verifier runs the default branch's copy, read-only, under its own check name", () => {
  // A green ci.yml push run on the same commit must never stand in for it.
  assert.match(promotion, /name: Promotion Verified/);
  assert.doesNotMatch(promotion, /name: CI Success/);
  // pull_request_target: the definition is qa's reviewed copy, not the PR's.
  assert.match(promotion, /pull_request_target:\n {8}branches: \[production\]/);
  assert.doesNotMatch(promotion, /\n {4}pull_request:/);
  assert.doesNotMatch(promotion, /: write|secrets\./);
  // The only checkout is qa's history; the PR's commits are fetched, never run.
  assert.deepEqual(promotion.match(/uses: actions\/checkout@\S+/g)?.length, 1);
  assert.match(promotion, /ref: qa\n/);
  assert.doesNotMatch(promotion, /pnpm|npm |node |bash scripts/);
});

test("only a qa release or a hotfix/* branch may target production", () => {
  const pair = (base, head, repository = "acme/app") =>
    runShell(promotion, "- name: Validate the branch pair", {
      BASE_REF: base,
      HEAD_REF: head,
      HEAD_REPOSITORY: repository,
    });
  const release = pair("production", "qa");
  assert.equal(release.status, 0, release.stderr);
  assert.deepEqual(release.outputs, { validated_branch: "qa" });
  const hotfix = pair("production", "hotfix/login");
  assert.equal(hotfix.status, 0, hotfix.stderr);
  assert.deepEqual(hotfix.outputs, {
    validated_branch: "hotfix/login",
    hotfix: "true",
  });
  // ci.yml's push glob is case-sensitive, so these get no run to reuse.
  for (const head of ["feature/x", "Hotfix/login", "hotfixes/login", "main"]) {
    assert.equal(pair("production", head).status, 1, head);
  }
  assert.equal(pair("production", "qa", "fork/app").status, 1);
});

/** A repository with `origin/qa` and `origin/production` refs. */
function releaseRepo() {
  const root = mkdtempSync(path.join(tmpdir(), "release-"));
  const git = (...args) => {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf-8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@example.invalid",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@example.invalid",
      },
    });
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  /**
   * @param {string} file path relative to the repository root
   * @param {string} content what the file holds
   * @param {string} message the commit message
   * @returns {string} the new commit's SHA
   */
  const commit = (file, content, message) => {
    writeFileSync(path.join(root, file), content);
    git("add", ".");
    git("commit", "--quiet", "-m", message);
    return git("rev-parse", "HEAD");
  };
  git("init", "--quiet", "--initial-branch=qa");
  const base = commit("app.txt", "v1\n", "base");
  git("branch", "production");
  const feature = commit("feature.txt", "feature\n", "feat: feature");
  // An earlier release, landed as a merge commit: production is now commit-
  // ahead of qa with the same tree, which a fast-forward rule would reject.
  git("checkout", "--quiet", "production");
  git("merge", "--quiet", "--no-ff", "qa", "-m", "[RELEASE] 1");
  git("checkout", "--quiet", "qa");
  const next = commit("next.txt", "next\n", "feat: next");
  const sync = () => {
    git("update-ref", "refs/remotes/origin/qa", git("rev-parse", "qa"));
    git(
      "update-ref",
      "refs/remotes/origin/production",
      git("rev-parse", "production")
    );
  };
  sync();
  return { root, git, commit, sync, base, feature, next };
}

/**
 * @param {ReturnType<typeof releaseRepo>} repo the throwaway repository
 * @param {Record<string, string>} env the step environment
 * @returns {ReturnType<typeof runShell>} the step's result
 */
const provenance = (repo, env) =>
  runShell(promotion, "- name: Resolve the validated commit", env, repo.root);

test("a release PR is verified by the qa commit holding the merge result", () => {
  const repo = releaseRepo();
  const result = provenance(repo, {
    PROMOTION_SHA: repo.next,
    BASE_REF: "production",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs.validated_sha, repo.next);
  assert.equal(result.outputs.base_sha, repo.git("rev-parse", "production"));
});

test("a production push of a release is matched to qa; an unknown tree defers to the hotfix check", () => {
  const repo = releaseRepo();
  repo.git("checkout", "--quiet", "production");
  repo.git("merge", "--quiet", "--no-ff", "qa", "-m", "[RELEASE] 2");
  const landed = provenance(repo, {
    PROMOTION_SHA: repo.git("rev-parse", "HEAD"),
  });
  assert.equal(landed.status, 0, landed.stderr);
  assert.equal(landed.outputs.validated_sha, repo.next);

  const stray = repo.commit("stray.txt", "x\n", "fix: straight to production");
  const unknown = provenance(repo, { PROMOTION_SHA: stray });
  assert.equal(unknown.status, 0, unknown.stderr);
  assert.equal(unknown.outputs.hotfix_candidate, "true");
  assert.equal(unknown.outputs.validated_sha, undefined);
});

test("a release PR fails when production holds content qa never validated, or conflicts", () => {
  const repo = releaseRepo();
  repo.git("checkout", "--quiet", "production");
  repo.commit("hotfix.txt", "fix\n", "fix: hotfix");
  repo.git("checkout", "--quiet", "qa");
  repo.sync();
  const unvalidated = provenance(repo, {
    PROMOTION_SHA: repo.next,
    BASE_REF: "production",
  });
  assert.equal(unvalidated.status, 1);
  assert.match(unvalidated.stdout, /matches no qa commit/);

  repo.git("checkout", "--quiet", "production");
  repo.commit("app.txt", "production\n", "fix: production edit");
  repo.git("checkout", "--quiet", "qa");
  const qaEdit = repo.commit("app.txt", "qa\n", "feat: qa edit");
  repo.sync();
  const conflict = provenance(repo, {
    PROMOTION_SHA: qaEdit,
    BASE_REF: "production",
  });
  assert.equal(conflict.status, 1);
  assert.match(conflict.stdout, /conflicts/);
});

test("a hotfix PR is verified while production is an ancestor of its head", () => {
  const repo = releaseRepo();
  repo.git("checkout", "--quiet", "-b", "hotfix/login", "production");
  const hotfix = repo.commit("hotfix.txt", "fix\n", "fix: login");
  repo.sync();
  const current = provenance(repo, {
    PROMOTION_SHA: hotfix,
    BASE_REF: "production",
    HOTFIX: "true",
  });
  assert.equal(current.status, 0, current.stderr);
  assert.equal(current.outputs.validated_sha, hotfix);

  repo.git("checkout", "--quiet", "production");
  repo.commit("other.txt", "other\n", "fix: another hotfix");
  repo.sync();
  const moved = provenance(repo, {
    PROMOTION_SHA: hotfix,
    BASE_REF: "production",
    HOTFIX: "true",
  });
  assert.equal(moved.status, 1);
  assert.equal(moved.outputs.validated_sha, undefined);
});

/** @param {{ status: string; conclusion: string | null }[][]} pages one list per poll */
async function pollRuns(pages) {
  const core = coreMock();
  const queries = [];
  await runScript(promotion, "- name: Require a green ci.yml push run", {
    core,
    process: { env: { VALIDATED_SHA: "a".repeat(40), VALIDATED_BRANCH: "qa" } },
    context: { repo: { owner: "acme", repo: "app" } },
    github: {
      rest: {
        actions: {
          listWorkflowRuns: (params) => {
            queries.push(params);
            const runs = pages[Math.min(queries.length, pages.length) - 1];
            return { data: { workflow_runs: runs } };
          },
        },
      },
    },
    setTimeout: immediate,
  });
  return { core, queries };
}

test("verification requires a green ci.yml push run, waiting for one in flight", async () => {
  const green = await pollRuns([
    [{ status: "in_progress", conclusion: null }],
    [{ status: "completed", conclusion: "success", html_url: "u" }],
  ]);
  assert.deepEqual(green.core.failures, []);
  assert.equal(green.queries.length, 2);
  assert.deepEqual(
    { ...green.queries[0] },
    {
      owner: "acme",
      repo: "app",
      workflow_id: "ci.yml",
      branch: "qa",
      event: "push",
      head_sha: "a".repeat(40),
      per_page: 10,
    }
  );

  for (const conclusion of ["failure", "cancelled"]) {
    const red = await pollRuns([[{ status: "completed", conclusion }]]);
    assert.equal(red.core.failures.length, 1, conclusion);
    // A finished red run fails at once instead of waiting out the poll.
    assert.equal(red.queries.length, 1, conclusion);
  }
  // No run at all is never a pass: it times out as a failure.
  const missing = await pollRuns([[]]);
  assert.equal(missing.core.failures.length, 1);
  assert.equal(missing.queries.length, 60);
});

const MERGE_SHA = "c".repeat(40);
const HEAD_SHA = "d".repeat(40);
const TREE = "e".repeat(40);
const mergedHotfix = (overrides = {}) => ({
  number: 7,
  merged_at: "2026-10-01T00:00:00Z",
  merge_commit_sha: MERGE_SHA,
  base: { ref: "production" },
  head: { ref: "hotfix/login", sha: HEAD_SHA },
  ...overrides,
});

async function verifyHotfixMerge({
  associated = [mergedHotfix()],
  runs = [{ conclusion: "success", html_url: "u" }],
  trees = { [MERGE_SHA]: TREE, [HEAD_SHA]: TREE },
} = {}) {
  const core = coreMock();
  const queries = [];
  await runScript(
    promotion,
    "- name: Verify the hotfix merge behind this push",
    {
      core,
      context: { repo: { owner: "acme", repo: "app" }, sha: MERGE_SHA },
      github: {
        rest: {
          repos: {
            listPullRequestsAssociatedWithCommit: () => ({ data: associated }),
          },
          actions: {
            listWorkflowRuns: (params) => {
              queries.push(params);
              return { data: { workflow_runs: runs } };
            },
          },
          git: {
            getCommit: ({ commit_sha: sha }) => ({
              data: { tree: { sha: trees[sha] } },
            }),
          },
        },
      },
      setTimeout: immediate,
    }
  );
  return { core, queries };
}

test("a hotfix merge on production is accepted only with a green run on the landed tree", async () => {
  const accepted = await verifyHotfixMerge();
  assert.deepEqual(accepted.core.failures, []);
  assert.equal(accepted.queries[0].branch, "hotfix/login");
  assert.equal(accepted.queries[0].head_sha, HEAD_SHA);
  assert.match(accepted.core.warnings[0], /\[MERGE-BACK\] Production -> QA/);

  for (const [reason, overrides] of [
    ["no pull request", { associated: [] }],
    ["not merged", { associated: [mergedHotfix({ merged_at: null })] }],
    [
      "another merge commit",
      { associated: [mergedHotfix({ merge_commit_sha: "f".repeat(40) })] },
    ],
    ["another base", { associated: [mergedHotfix({ base: { ref: "qa" } })] }],
    [
      "not a hotfix branch",
      {
        associated: [
          mergedHotfix({ head: { ref: "feature/x", sha: HEAD_SHA } }),
        ],
      },
    ],
    ["no run", { runs: [] }],
    ["a red run", { runs: [{ conclusion: "failure" }] }],
    [
      "a tree the run never tested",
      { trees: { [MERGE_SHA]: TREE, [HEAD_SHA]: "9".repeat(40) } },
    ],
  ]) {
    const { core } = await verifyHotfixMerge(overrides);
    assert.equal(core.failures.length, 1, reason);
    assert.deepEqual(core.warnings, [], reason);
  }
});

test("the opener resolves the release and the merge-back pair, nothing else", () => {
  const pair = (head) =>
    runShell(opener, "- name: Resolve the promotion pair", {
      HEAD_BRANCH: head,
    });
  assert.deepEqual(pair("qa").outputs, {
    head: "qa",
    base: "production",
    title: "[RELEASE] QA -> Production",
  });
  assert.deepEqual(pair("production").outputs, {
    head: "production",
    base: "qa",
    title: "[MERGE-BACK] Production -> QA",
  });
  assert.equal(pair("demo").status, 1);
});

/**
 * Puts a fake `gh` first on PATH: `pr list` prints `open`, `api` prints the
 * compare payload, `pr create` prints a PR URL.
 */
function fakeGh({ open = "", compare = {} } = {}) {
  const bin = mkdtempSync(path.join(tmpdir(), "fake-gh-"));
  writeFileSync(path.join(bin, "compare.json"), JSON.stringify(compare));
  writeFileSync(
    path.join(bin, "gh"),
    [
      "#!/bin/sh",
      `case "$1 $2" in`,
      `  "pr list") echo "${open}" ;;`,
      `  "pr create") echo https://github.com/acme/app/pull/99 ;;`,
      `  api*) cat "${bin}/compare.json" ;;`,
      "esac",
      "",
    ].join("\n")
  );
  chmodSync(path.join(bin, "gh"), 0o755);
  return `${bin}:${process.env.PATH}`;
}

const commit = (message, parents = 1) => ({
  parents: Array.from({ length: parents }, () => ({})),
  commit: { message },
});

function range(gh) {
  return runShell(opener, "- name: Decide whether a pull request is needed", {
    PATH: gh,
    BASE_BRANCH: "production",
    HEAD_BRANCH: "qa",
  });
}

test("the opener opens only when none is open and the head holds new content", () => {
  const ahead = {
    ahead_by: 3,
    total_commits: 3,
    files: [{ filename: "a" }],
    commits: [
      commit("feat: one\n\nbody"),
      commit("[RELEASE] QA -> Production (#9)", 2),
      commit("fix: two"),
    ],
  };
  const open = range(fakeGh({ compare: ahead }));
  assert.equal(open.status, 0, open.stderr);
  assert.equal(open.outputs.open, "true");
  assert.equal(
    readFileSync(path.join(open.temp, "commits.md"), "utf-8"),
    "- feat: one\n- fix: two\n"
  );

  assert.equal(
    range(fakeGh({ open: "12", compare: ahead })).outputs.open,
    "false"
  );
  // Commit-ahead but tree-equal: production after a release, qa after a
  // merge-back. Nothing to merge.
  assert.equal(
    range(fakeGh({ compare: { ...ahead, files: [] } })).outputs.open,
    "false"
  );
  assert.equal(
    range(fakeGh({ compare: { ...ahead, ahead_by: 0 } })).outputs.open,
    "false"
  );
  // A payload without `files` is not proof of emptiness.
  const { files: _files, ...unknown } = ahead;
  assert.equal(range(fakeGh({ compare: unknown })).outputs.open, "true");
});

test("the release body is capped at 50 subjects", () => {
  const many = Array.from({ length: 60 }, (_, index) =>
    commit(`feat: ${index}`)
  );
  const result = range(
    fakeGh({
      compare: { ahead_by: 60, total_commits: 60, files: [{}], commits: many },
    })
  );
  const lines = readFileSync(path.join(result.temp, "commits.md"), "utf-8")
    .trim()
    .split("\n");
  assert.equal(lines.length, 51);
  assert.match(lines.at(-1) ?? "", /and more/);
});

function body(base, head) {
  const temp = mkdtempSync(path.join(tmpdir(), "opener-"));
  writeFileSync(path.join(temp, "commits.md"), "- fix: something\n");
  const result = runShell(opener, "- name: Open the promotion pull request", {
    PATH: fakeGh(),
    RUNNER_TEMP: temp,
    BASE_BRANCH: base,
    HEAD_BRANCH: head,
    TITLE: "title",
    SERVER_URL: "https://github.com",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs.url, "https://github.com/acme/app/pull/99");
  return readFileSync(path.join(temp, "body.md"), "utf-8");
}

test("both bodies demand a merge commit; only the merge-back carries the callout", () => {
  const mergeBack = body("qa", "production");
  assert.match(mergeBack, /^> \[!IMPORTANT\]$/m);
  assert.match(mergeBack, /Hotfix merge-back, not a release/);
  assert.match(mergeBack, /\*\*Merge this with a merge commit\*\*/);
  const release = body("production", "qa");
  assert.doesNotMatch(release, /\[!IMPORTANT\]/);
  assert.match(release, /## What this promotes/);
  assert.match(release, /\*\*Merge this with a merge commit\*\*/);
  assert.match(release, /compare\/production\.\.\.qa/);
});

test("the opener acts through the bot App, and asks for a reopen without it", () => {
  assert.match(opener, /uses: actions\/create-github-app-token@v3/);
  assert.match(
    opener,
    /GH_TOKEN: \$\{\{ steps\.bot\.outputs\.token \|\| github\.token \}\}/
  );
  assert.match(
    opener,
    /if: steps\.open\.outputs\.url != '' && steps\.bot\.outputs\.token == ''/
  );
  assert.doesNotMatch(opener, /gh workflow run|statuses: write/);
  assert.match(SHA.source, /40/);
});
