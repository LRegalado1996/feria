/// <reference types="node" />
/**
 * Test harness for workflow logic: pulls a `run: |` or `script: |` block out
 * of a workflow file so `node --test` can execute the real code against fake
 * APIs, with no network and no PR code.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { runInNewContext } from "node:vm";

const INDENT = /^\s*/;
const FIRST_EQUALS = /[=](.*)/s;

/**
 * @param {string} source workflow text
 * @param {string} anchor text that identifies the step, e.g. its `- name:` line
 * @param {string} marker the block scalar line, `run: |` or `script: |`
 * @returns {string} the first such block after the anchor, dedented
 */
export function block(source, anchor, marker) {
  const start = source.indexOf(anchor);
  assert.ok(start !== -1, `Missing workflow step: ${anchor}`);
  const lines = source.slice(start).split("\n");
  const index = lines.findIndex((line) => line.trim() === marker);
  assert.ok(index !== -1, `Missing ${marker} after ${anchor}`);
  const indent = INDENT.exec(lines[index + 1] ?? "")?.[0].length ?? 0;
  const body = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() && (INDENT.exec(line)?.[0].length ?? 0) < indent) {
      break;
    }
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

/**
 * @param {string} file workflow path, relative to the repository root
 * @returns {string} its text
 */
export function workflow(file) {
  return readFileSync(path.join(".github/workflows", file), "utf-8");
}

/**
 * Runs a step's `run: |` block in bash with GITHUB_OUTPUT captured.
 *
 * @param {string} source workflow text
 * @param {string} anchor the step's `- name:` line
 * @param {Record<string, string>} [env] step environment
 * @param {string} [cwd] working directory
 * @returns {{ status: number | null; outputs: Record<string, string>; stdout: string; stderr: string; temp: string }}
 *   exit status, step outputs, streams and the RUNNER_TEMP used
 */
export function runShell(source, anchor, env = {}, cwd = process.cwd()) {
  const temp = mkdtempSync(path.join(tmpdir(), "workflow-step-"));
  const outputPath = path.join(temp, "github-output");
  writeFileSync(outputPath, "");
  const result = spawnSync("bash", ["-c", block(source, anchor, "run: |")], {
    cwd,
    env: {
      PATH: process.env.PATH,
      GITHUB_OUTPUT: outputPath,
      GITHUB_STEP_SUMMARY: path.join(temp, "summary"),
      GITHUB_REPOSITORY: "acme/app",
      RUNNER_TEMP: temp,
      ...env,
    },
    encoding: "utf-8",
  });
  assert.ifError(result.error);
  const outputs = Object.fromEntries(
    readFileSync(outputPath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(FIRST_EQUALS).slice(0, 2))
  );
  return {
    status: result.status,
    outputs,
    stdout: result.stdout,
    stderr: result.stderr,
    temp,
  };
}

/**
 * @returns {{ failures: string[]; warnings: string[]; notices: string[]; outputs: Record<string, string>; summary: object; [key: string]: unknown }}
 *   a stand-in for `@actions/core` that records what the script reported
 */
export function coreMock() {
  const failures = [];
  const warnings = [];
  const notices = [];
  /** @type {Record<string, string>} */
  const outputs = {};
  const summary = {
    addHeading() {
      return this;
    },
    addRaw() {
      return this;
    },
    addLink() {
      return this;
    },
    async write() {
      await Promise.resolve();
    },
  };
  return {
    failures,
    warnings,
    notices,
    outputs,
    summary,
    setOutput(name, value) {
      outputs[name] = value;
    },
    info() {
      // `core.info` lines are progress chatter; no test asserts on them.
    },
    notice(message) {
      notices.push(message);
    },
    warning(message) {
      warnings.push(message);
    },
    setFailed(message) {
      failures.push(message);
    },
  };
}

/**
 * Runs a step's `script: |` block (actions/github-script) in a VM.
 *
 * @param {string} source workflow text
 * @param {string} anchor the step's `- name:` line
 * @param {Record<string, unknown>} context the globals the script sees
 * @returns {Promise<void>} resolves when the script does
 */
export async function runScript(source, anchor, context) {
  await runInNewContext(
    `(async () => { ${block(source, anchor, "script: |")} })()`,
    context
  );
}
