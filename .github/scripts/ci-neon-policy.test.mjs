/// <reference types="node" />
/**
 * The Neon preview-branch workflows, executed for real against stub `curl` and
 * `gh` binaries. No network, no Neon account:
 *
 *   node --test ".github/scripts/*.test.mjs"
 */

import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";

import { runShell, workflow } from "./workflow-step.mjs";

const cleanup = workflow("neon-cleanup.yml");
const prune = workflow("neon-prune.yml");
const OLD = "2000-01-01T00:00:00Z";
const YOUNG = "2999-01-01T00:00:00Z";

/**
 * A directory with stub `curl` (serves `branches`, logs every call) and `gh`
 * (prints the open PR branches).
 *
 * @param {{ branches?: { id: string; name: string; created_at: string }[]; open?: string[]; listFails?: boolean; deleteFails?: boolean }} world
 *   what Neon and GitHub report
 * @returns {{ dir: string; env: Record<string, string>; calls: () => string[] }}
 *   the stub directory, the step env that uses it, and the curl calls made
 */
function stubs({ branches = [], open = [], listFails, deleteFails }) {
  const dir = mkdtempSync(path.join(tmpdir(), "neon-"));
  const log = path.join(dir, "curl.log");
  writeFileSync(log, "");
  writeFileSync(path.join(dir, "branches.json"), JSON.stringify({ branches }));
  writeFileSync(path.join(dir, "open.txt"), open.join("\n"));
  /**
   * @param {string} name the binary to stub
   * @param {string} body its bash body
   */
  const script = (name, body) => {
    writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path.join(dir, name), 0o755);
  };
  script(
    "curl",
    `echo "$*" >> "${log}"
case " $* " in *" DELETE "*) exit ${deleteFails ? 22 : 0} ;; esac
${listFails ? "exit 22" : `cat "${dir}/branches.json"`}`
  );
  script("gh", `cat "${dir}/open.txt"`);
  return {
    dir,
    env: {
      PATH: `${dir}:${process.env.PATH}`,
      NEON_API_KEY: "neon-key",
      NEON_PROJECT_ID: "proj-1",
      GITHUB_REPOSITORY: "acme/app",
    },
    calls: () => readFileSync(log, "utf-8").split("\n").filter(Boolean),
  };
}

/**
 * @param {string[]} calls the logged curl argument lines
 * @returns {(string | undefined)[]} the branch ids it sent a DELETE for
 */
const deleted = (calls) =>
  calls
    .filter((call) => call.includes("DELETE"))
    .map((call) => call.split("/branches/")[1]);

/**
 * @param {ReturnType<typeof stubs>} world the stubs to run against
 * @param {Record<string, string>} env extra step env
 * @returns {ReturnType<typeof runShell>} the step's result
 */
const runCleanup = (world, env = {}) =>
  runShell(
    cleanup,
    "- name: Delete the Neon branch",
    { ...world.env, BRANCH: "preview/feature/x", ...env },
    world.dir
  );

/**
 * @param {ReturnType<typeof stubs>} world the stubs to run against
 * @param {Record<string, string>} env extra step env
 * @returns {ReturnType<typeof runShell>} the step's result
 */
const runPrune = (world, env = {}) =>
  runShell(
    prune,
    "- name: Delete preview branches without an open PR",
    { ...world.env, DRY_RUN: "false", ...env },
    world.dir
  );

test("cleanup deletes the closed PR's preview branch and nothing else", () => {
  const world = stubs({
    branches: [
      { id: "br-1", name: "preview/feature/x", created_at: OLD },
      { id: "br-2", name: "preview/feature/xy", created_at: OLD },
    ],
  });
  const result = runCleanup(world);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deleted(world.calls()), ["br-1"]);
  assert.ok(world.calls().every((call) => call.includes("proj-1")));
});

test("cleanup of a PR that never had a preview deletes nothing", () => {
  const world = stubs({
    branches: [{ id: "br-2", name: "preview/other", created_at: OLD }],
  });
  const result = runCleanup(world);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deleted(world.calls()), []);
});

test("unconfigured, both workflows explain the no-op and call nothing", () => {
  for (const key of ["NEON_API_KEY", "NEON_PROJECT_ID"]) {
    for (const run of [runCleanup, runPrune]) {
      const world = stubs({
        branches: [{ id: "br-1", name: "preview/feature/x", created_at: OLD }],
      });
      const result = run(world, { [key]: "" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /::notice::/);
      assert.deepEqual(world.calls(), []);
    }
  }
});

test("a Neon API failure fails both runs visibly", () => {
  for (const run of [runCleanup, runPrune]) {
    const world = stubs({ listFails: true });
    assert.notEqual(run(world).status, 0);
    assert.deepEqual(deleted(world.calls()), []);
  }
  const world = stubs({
    branches: [{ id: "br-1", name: "preview/feature/x", created_at: OLD }],
    deleteFails: true,
  });
  assert.notEqual(runCleanup(world).status, 0);
});

test("prune deletes old preview branches without an open PR, and only those", () => {
  const world = stubs({
    open: ["feature/open", "feature/a-very-long-branch-name"],
    branches: [
      { id: "br-stale", name: "preview/feature/merged", created_at: OLD },
      { id: "br-open", name: "preview/feature/open", created_at: OLD },
      { id: "br-cut", name: "preview/feature/a-very-long", created_at: OLD },
      { id: "br-young", name: "preview/feature/new", created_at: YOUNG },
      { id: "br-main", name: "main", created_at: OLD },
      { id: "br-other", name: "staging", created_at: OLD },
    ],
  });
  const result = runPrune(world);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(deleted(world.calls()), ["br-stale"]);
  assert.match(result.stdout, /Stale preview branches: 1 /);
});

test("a dry run lists what it would delete and deletes nothing", () => {
  const world = stubs({
    branches: [{ id: "br-1", name: "preview/feature/x", created_at: OLD }],
  });
  const result = runPrune(world, { DRY_RUN: "true" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /would delete {2}preview\/feature\/x/);
  assert.deepEqual(deleted(world.calls()), []);
});

test("prune stops when the open-PR list may be truncated", () => {
  const world = stubs({
    open: Array.from({ length: 1000 }, (_, i) => `feature/${i}`),
    branches: [{ id: "br-1", name: "preview/feature/x", created_at: OLD }],
  });
  const result = runPrune(world);
  assert.equal(result.status, 1);
  assert.deepEqual(world.calls(), []);
});

test("a failed deletion turns the sweep red after trying the rest", () => {
  const world = stubs({
    branches: [
      { id: "br-1", name: "preview/feature/x", created_at: OLD },
      { id: "br-2", name: "preview/feature/y", created_at: OLD },
    ],
    deleteFails: true,
  });
  const result = runPrune(world);
  assert.equal(result.status, 1);
  assert.deepEqual(deleted(world.calls()), ["br-1", "br-2"]);
  assert.match(result.stdout, /::warning::/);
});

test("triggers, permissions and the dry-run default", () => {
  assert.match(cleanup, /pull_request:\n {8}types: \[closed\]/);
  assert.match(cleanup, /\npermissions: \{\}\n/);
  assert.match(
    cleanup,
    /if: github\.head_ref != 'qa' && github\.head_ref != 'main'/
  );
  // The branch name reaches the script through env only.
  assert.doesNotMatch(cleanup, /run: \|[\s\S]*\$\{\{/);
  assert.doesNotMatch(prune, /run: \|[\s\S]*\$\{\{/);
  assert.match(prune, /schedule:\n {8}- cron: /);
  assert.match(prune, /dry_run:[\s\S]*?default: true/);
  assert.match(
    prune,
    /DRY_RUN: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.dry_run \|\| 'false' \}\}/
  );
  assert.match(prune, /\npermissions:\n {4}pull-requests: read\n\n/);
});
