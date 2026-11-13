/// <reference types="node" />
/**
 * The opt-in preview workflow's logic, executed for real against fake GitHub
 * and Vercel APIs. No network, no PR code, no paid deployment.
 *
 *   node --test ".github/scripts/*.test.mjs"
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { coreMock, runScript, workflow } from "./workflow-step.mjs";

const preview = workflow("deploy-preview.yml");
const STEP = "- name: Deploy the head of an opted-in PR";
const HEAD_SHA = "a".repeat(40);

function fixture() {
  const pr = {
    number: 42,
    state: "open",
    draft: false,
    labels: [{ name: "deploy:preview" }],
    head: {
      sha: HEAD_SHA,
      ref: "feature/preview",
      repo: { id: 123, full_name: "acme/app" },
    },
    base: { ref: "qa" },
  };
  return {
    pr,
    current: pr,
    payload: { pull_request: { number: 42 }, repository: { id: 123 } },
    actor: "someone",
    env: {
      VERCEL_TOKEN: "test-token",
      VERCEL_PROJECT_ID: "prj_test",
      VERCEL_TEAM_ID: "team_test",
    },
    deployments: [],
    status: 200,
  };
}

/**
 * @param {ReturnType<typeof fixture>} f the scenario to run the step against
 * @returns {Promise<{ calls: { url: URL; options: { method?: string; body?: string } }[]; core: ReturnType<typeof coreMock> }>}
 *   every fetch the step made and what it reported through `core`
 */
async function deploy(f) {
  const calls = [];
  const core = coreMock();
  let reads = 0;
  await runScript(preview, STEP, {
    core,
    github: {
      rest: {
        pulls: { get: () => ({ data: reads++ === 0 ? f.pr : f.current }) },
        // Reaching the POST with this throwing proves no CI run gates the
        // preview: a gate withheld it from most pushes of an iterating PR.
        actions: {
          listWorkflowRuns: () => {
            throw new Error("the preview must not gate on a CI run");
          },
        },
      },
    },
    context: {
      repo: { owner: "acme", repo: "app" },
      payload: f.payload,
      actor: f.actor,
    },
    process: { env: f.env },
    URL,
    URLSearchParams,
    AbortSignal,
    fetch: (url, options) => {
      calls.push({ url, options });
      return {
        ok: f.status === 200,
        status: f.status,
        json: () =>
          options.method === "POST"
            ? { id: "dpl_test", url: "test.vercel.app" }
            : { deployments: f.deployments },
      };
    },
  });
  return { calls, core };
}

test("a labeled push deploys its head as a preview, never to production", async () => {
  const f = fixture();
  const { calls } = await deploy(f);
  assert.equal(calls.length, 2);
  const lookup = calls[0].url.searchParams;
  assert.equal(lookup.get("sha"), HEAD_SHA);
  assert.equal(lookup.get("target"), "preview");
  assert.equal(lookup.get("projectId"), "prj_test");
  assert.equal(lookup.get("teamId"), "team_test");
  assert.equal(calls[1].url.searchParams.get("teamId"), "team_test");
  const body = JSON.parse(String(calls[1].options.body));
  assert.deepEqual(body.gitSource, {
    type: "github",
    repoId: 123,
    ref: "feature/preview",
    sha: HEAD_SHA,
  });
  assert.equal(body.project, "prj_test");
  assert.equal(body.target, undefined);
  assert.equal(body.meta.githubPrId, "42");
});

test("a push, a label and a manual retry pass the same checks", async () => {
  for (const payload of [
    { pull_request: { number: 42 } },
    { inputs: { pr_number: "42" } },
  ]) {
    const f = fixture();
    f.payload = { repository: { id: 123 }, ...payload };
    assert.equal((await deploy(f)).calls.length, 2);
  }
});

test("unlabeled, draft, closed, fork, release and stacked PRs never call Vercel", async () => {
  for (const override of [
    { labels: [] },
    { labels: [{ name: "size:M" }] },
    { draft: true },
    { state: "closed" },
    { head: { ...fixture().pr.head, repo: null } },
    { head: { ...fixture().pr.head, repo: { id: 456 } } },
    { head: { ...fixture().pr.head, ref: "qa" } },
    { base: { ref: "main" } },
    { base: { ref: "feature/parent" } },
  ]) {
    const f = fixture();
    Object.assign(f.pr, override);
    assert.equal((await deploy(f)).calls.length, 0, JSON.stringify(override));
  }
});

test("a hotfix PR into main previews by manual dispatch, a release does not", async () => {
  const hotfix = fixture();
  hotfix.pr.base = { ref: "main" };
  hotfix.pr.head = { ...hotfix.pr.head, ref: "hotfix/login" };
  hotfix.payload = { repository: { id: 123 }, inputs: { pr_number: "42" } };
  const { calls } = await deploy(hotfix);
  assert.equal(calls.length, 2);
  assert.equal(
    JSON.parse(String(calls[1].options.body)).gitSource.ref,
    "hotfix/login"
  );

  for (const ref of ["qa", "Hotfix/login"]) {
    const other = fixture();
    other.pr.base = { ref: "main" };
    other.pr.head = { ...other.pr.head, ref };
    assert.equal((await deploy(other)).calls.length, 0, ref);
  }
});

test("a stale event payload still deploys the PR's current head", async () => {
  const f = fixture();
  f.pr = { ...f.pr, head: { ...f.pr.head, sha: "b".repeat(40) } };
  f.current = f.pr;
  const { calls } = await deploy(f);
  assert.equal(calls[0].url.searchParams.get("sha"), "b".repeat(40));
  assert.equal(
    JSON.parse(String(calls[1].options.body)).gitSource.sha,
    "b".repeat(40)
  );
});

test("an unusable PR number does not deploy", async () => {
  for (const payload of [
    {},
    { inputs: { pr_number: "not-a-number" } },
    { inputs: { pr_number: "-1" } },
  ]) {
    const f = fixture();
    f.payload = { repository: { id: 123 }, ...payload };
    assert.equal((await deploy(f)).calls.length, 0);
  }
});

test("a queued, building or ready deployment of the commit is reused", async () => {
  const f = fixture();
  f.deployments = [{ id: "dpl_existing" }];
  const { calls } = await deploy(f);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url.searchParams.get("state"),
    "BUILDING,INITIALIZING,QUEUED,READY"
  );
});

test("a label removed, a close, a draft or a new head before the POST stops it", async () => {
  for (const override of [
    { labels: [] },
    { state: "closed" },
    { draft: true },
    { head: { ...fixture().pr.head, sha: "c".repeat(40) } },
  ]) {
    const f = fixture();
    f.current = { ...f.pr, ...override };
    assert.equal((await deploy(f)).calls.length, 1, JSON.stringify(override));
  }
});

test("missing setup and Vercel failures fail visibly without a POST", async () => {
  for (const key of ["VERCEL_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"]) {
    const f = fixture();
    f.env = { ...f.env, [key]: "" };
    await assert.rejects(
      async () => await deploy(f),
      /Preview not configured/,
      key
    );
  }
  const forbidden = fixture();
  forbidden.status = 403;
  await assert.rejects(async () => await deploy(forbidden), /HTTP 403/);
});

test("a Dependabot-triggered run without secrets explains itself instead of failing", async () => {
  const f = fixture();
  f.actor = "dependabot[bot]";
  f.env = { ...f.env, VERCEL_TOKEN: "" };
  const { calls, core } = await deploy(f);
  assert.equal(calls.length, 0);
  assert.match(core.notices.at(-1) ?? "", /Dependabot/);
});

test("only stable branches auto-deploy, and the privileged workflow runs no PR code", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf-8"));
  assert.deepEqual(config.git.deploymentEnabled, {
    "**": false,
    qa: true,
    main: true,
    "dependabot/*": false,
    "dependabot/**": false,
  });
  assert.match(preview, /pull_request_target:\n {8}branches: \[qa\]/);
  assert.match(preview, /types: \[labeled, synchronize, ready_for_review\]/);
  assert.match(preview, /github\.event\.label\.name == 'deploy:preview'/);
  assert.match(preview, /github\.ref == 'refs\/heads\/qa'/);
  // The token is an environment secret, admitted only on qa; not a repo secret
  // shared with other workflows.
  assert.match(preview, /environment: preview\n/);
  assert.match(
    preview,
    /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_PREVIEW_TOKEN \}\}/
  );
  assert.equal(preview.match(/\$\{\{ secrets\./g)?.length, 1);
  assert.doesNotMatch(
    preview,
    /actions\/checkout|download-artifact|git push|: write|run: /
  );
  // Job-level concurrency: a workflow-level group is joined before `if:`, so a
  // skipped `size:*` label event would cancel the run deploying the push.
  assert.doesNotMatch(preview, /\nconcurrency:/);
  assert.match(preview, /\n {8}concurrency:\n {12}group: preview-/);
  assert.match(preview, /cancel-in-progress: true/);
});
