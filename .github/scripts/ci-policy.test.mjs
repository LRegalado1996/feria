/// <reference types="node" />
/**
 * ci.yml's change classifier and `CI Success` gate, executed for real against
 * a fake GitHub API and fake job results:
 *
 *   node --test ".github/scripts/*.test.mjs"
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { coreMock, runScript, runShell, workflow } from "./workflow-step.mjs";

const ci = workflow("ci.yml");
const RUNTIME_JOBS = ["unit-test", "integration-test", "build", "e2e"];

/**
 * @param {string} id a job id under `jobs:`
 * @returns {string} that job's block, up to the next job
 */
function job(id) {
  const start = ci.indexOf(`\n    ${id}:\n`);
  assert.ok(start !== -1, `Missing job: ${id}`);
  const rest = ci.slice(start + 1);
  const end = rest.slice(1).search(/\n {4}\S/);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

/**
 * @param {{ eventName?: string; draft?: boolean; files?: { filename: string; previous_filename?: string }[] }} pr
 *   the event and the PR's changed files
 * @returns {Promise<{ outputs: Record<string, string>; listed: number }>}
 *   the step outputs and how many times the files were listed
 */
async function classify({ eventName = "pull_request", draft = false, files }) {
  const core = coreMock();
  let listed = 0;
  await runScript(ci, "- name: Classify the change", {
    core,
    context: {
      eventName,
      repo: { owner: "acme", repo: "app" },
      payload: { pull_request: { number: 7, draft } },
    },
    github: {
      rest: { pulls: { listFiles: "listFiles" } },
      paginate: (endpoint, params) => {
        assert.equal(endpoint, "listFiles");
        assert.equal(params.pull_number, 7);
        listed += 1;
        return files;
      },
    },
  });
  return { outputs: core.outputs, listed };
}

const file = (filename, previous) =>
  previous ? { filename, previous_filename: previous } : { filename };

test("pushes and manual runs are always full, without listing files", async () => {
  for (const eventName of ["push", "workflow_dispatch"]) {
    assert.deepEqual(await classify({ eventName }), {
      outputs: { full_ci: "true", deferred: "false" },
      listed: 0,
    });
  }
});

test("a draft defers the runtime jobs", async () => {
  assert.deepEqual(await classify({ draft: true }), {
    outputs: { full_ci: "false", deferred: "true" },
    listed: 0,
  });
});

test("documentation and agent or editor config skip the runtime jobs", async () => {
  const { outputs } = await classify({
    files: [
      file("README.md"),
      file("src/e2e/AGENTS.md"),
      file("docs/agents/ci.md"),
      file("docs/diagram.png"),
      file(".agents/skills/orpc/SKILL.md"),
      file(".claude/settings.json"),
      file(".cursor/rules/x.mdc"),
      file(".vscode/settings.json"),
      file(".superset/config.json"),
      file("docs/new.md", "docs/old.md"),
    ],
  });
  assert.deepEqual(outputs, { full_ci: "false", deferred: "false" });
});

test("any runtime file runs everything", async () => {
  for (const path of [
    "src/app/page.tsx",
    "package.json",
    ".github/workflows/ci.yml",
    "docsx/file.ts",
    "src/docs/page.tsx",
    "scripts/worktree.sh",
  ]) {
    const { outputs } = await classify({
      files: [file("README.md"), file(path)],
    });
    assert.equal(outputs.full_ci, "true", path);
  }
});

test("a rename is lightweight only when both of its sides are", async () => {
  for (const [to, from] of [
    ["docs/page.md", "src/app/page.tsx"],
    ["src/app/page.tsx", "docs/page.md"],
  ]) {
    const { outputs } = await classify({ files: [file(to, from)] });
    assert.equal(outputs.full_ci, "true", `${from} -> ${to}`);
  }
});

test("an empty or truncated file list fails closed to the full suite", async () => {
  const truncated = Array.from({ length: 3000 }, (_, i) =>
    file(`docs/${i}.md`)
  );
  for (const files of [[], truncated]) {
    const { outputs } = await classify({ files });
    assert.deepEqual(outputs, { full_ci: "true", deferred: "false" });
  }
});

const GREEN = {
  CHANGES: "success",
  FULL_CI: "true",
  DEFERRED: "false",
  STATIC_CHECKS: "success",
  UNIT_TEST: "success",
  INTEGRATION_TEST: "success",
  BUILD: "success",
  E2E: "success",
  GITLEAKS: "success",
};
const LIGHT = {
  ...GREEN,
  FULL_CI: "false",
  UNIT_TEST: "skipped",
  INTEGRATION_TEST: "skipped",
  BUILD: "skipped",
  E2E: "skipped",
};

/**
 * @param {Record<string, string>} env the job results the gate reads
 * @returns {{ status: number | null; stdout: string }} its verdict
 */
const gate = (env) => runShell(ci, "- name: Check all jobs passed", env);

test("the gate passes a full green run and a correctly skipped light run", () => {
  assert.equal(gate(GREEN).status, 0, gate(GREEN).stdout);
  assert.equal(gate(LIGHT).status, 0, gate(LIGHT).stdout);
});

test("the gate fails any full-run job that did not succeed", () => {
  for (const key of ["UNIT_TEST", "INTEGRATION_TEST", "BUILD", "E2E"]) {
    for (const result of ["failure", "cancelled", "skipped", ""]) {
      assert.equal(gate({ ...GREEN, [key]: result }).status, 1, key + result);
    }
  }
});

test("the light path fails unless every runtime job is exactly skipped", () => {
  for (const key of ["UNIT_TEST", "INTEGRATION_TEST", "BUILD", "E2E"]) {
    for (const result of ["success", "failure", "cancelled", ""]) {
      assert.equal(gate({ ...LIGHT, [key]: result }).status, 1, key + result);
    }
  }
});

test("classifier, static checks and gitleaks are required on every path", () => {
  for (const base of [GREEN, LIGHT]) {
    for (const key of ["CHANGES", "STATIC_CHECKS", "GITLEAKS"]) {
      for (const result of ["failure", "skipped", "cancelled", ""]) {
        assert.equal(gate({ ...base, [key]: result }).status, 1, key + result);
      }
    }
  }
});

test("a deferred draft and an unknown scope fail closed", () => {
  const draft = gate({ ...LIGHT, DEFERRED: "true" });
  assert.equal(draft.status, 1);
  assert.match(draft.stdout, /deferred/);
  for (const deferred of ["", "maybe"]) {
    assert.equal(gate({ ...GREEN, DEFERRED: deferred }).status, 1, deferred);
  }
  for (const scope of ["", "yes", "TRUE"]) {
    assert.equal(gate({ ...LIGHT, FULL_CI: scope }).status, 1, scope);
    assert.equal(gate({ ...GREEN, FULL_CI: scope }).status, 1, scope);
  }
});

test("the job graph matches what the gate assumes", () => {
  assert.match(
    ci,
    /pull_request:\n {8}branches-ignore: \[main\]\n(?: {8}#.*\n)* {8}types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft\]/
  );
  for (const id of RUNTIME_JOBS) {
    assert.match(
      job(id),
      /\n {8}if: needs\.changes\.outputs\.full_ci == 'true'\n/,
      id
    );
  }
  assert.match(job("e2e"), /needs: \[changes, build, static-checks\]/);
  // Drafts and documentation PRs still run these two.
  for (const id of ["static-checks", "gitleaks"]) {
    assert.doesNotMatch(job(id), /\n {8}(?:needs|if):/, id);
  }
  const gateJob = job("ci-success");
  assert.match(gateJob, /name: CI Success\n/);
  assert.match(gateJob, /\n {8}if: always\(\)\n/);
  assert.match(
    gateJob,
    /needs: \[changes, static-checks, unit-test, integration-test, build, e2e, gitleaks\]/
  );
  // Only the classifier may list the PR's files.
  assert.match(job("changes"), /pull-requests: read/);
  assert.equal(ci.match(/pull-requests: read/g)?.length, 1);
});
