import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

const __dirname = import.meta.dirname;

const isCI = !!process.env.CI;

// One time zone for the runner, its workers and the app server Playwright
// starts (they inherit this environment), matching the browser's `timezoneId`
// below: a date spec then computes the same calendar day as the app, whatever
// zone the machine is in.
process.env.TZ = "UTC";

// oxlint-disable-next-line typescript/prefer-nullish-coalescing -- an empty E2E_BASE_URL means unset
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";

function isServerRunning(url: string): boolean {
  try {
    execFileSync(
      "curl",
      ["-sf", "-o", "/dev/null", "--max-time", "2", "-k", url],
      {
        stdio: "ignore",
      }
    );
    return true;
  } catch {
    return false;
  }
}

// Set by tooling that only loads this config (`playwright test --list` in CI,
// knip): no server to start, and no probe of one.
const skipServer = process.env.PLAYWRIGHT_SKIP_SERVER === "true";
const reuseServer = !(isCI || skipServer) && isServerRunning(baseURL);

// E2E_WORKERS sizes a run to its machine. Otherwise CI uses up to 4 workers
// but never more than cores - 1: the runner also hosts the app server and
// Postgres, and workers past the core count only manufacture timeouts.
// Locally Playwright's default applies. Parallel is safe because each worker
// signs in as its own user (fixtures/user.fixture.ts).
function resolveWorkers(): number | undefined {
  const requested = Math.trunc(Number(process.env.E2E_WORKERS));

  if (requested > 0) {
    return requested;
  }

  return isCI
    ? Math.min(4, Math.max(1, os.availableParallelism() - 1))
    : undefined;
}

export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",

  // Every test may run beside any other: a worker owns its user, and a spec
  // asserts only on rows it created (src/e2e/AGENTS.md).
  fullyParallel: true,
  forbidOnly: isCI,
  // Zero, everywhere. A retry-pass is a defect report thrown away: a race the
  // retry hides ships. A failure fails the run, and the retained trace below
  // is how it gets diagnosed (src/e2e/AGENTS.md).
  retries: 0,
  // A broken boot fails every test: stop after 10 and report, instead of
  // grinding through identical failures.
  maxFailures: isCI ? 10 : undefined,
  // End the run in band 5 minutes before the CI job's 20-minute limit kills it
  // with no report, no traces and no list of what failed.
  globalTimeout: isCI ? 15 * 60 * 1000 : undefined,
  workers: resolveWorkers(),

  // One CI job, no shards: the HTML report is written directly, and CI
  // uploads it only when the run fails.
  reporter: isCI
    ? [["list"], ["html", { open: "never" }]]
    : [["html", { open: "on-failure" }]],

  use: {
    baseURL,
    ignoreHTTPSErrors: !isCI,
    timezoneId: "UTC",
    // With no retries, "on-first-retry" would never record. Every CI test is
    // traced and the trace kept only when it fails, so the first failure is
    // triageable. `sources: false`: the repo is the source. Locally a failure
    // reproduces under --ui or --debug, so runs stay lean.
    trace: isCI
      ? { mode: "retain-on-failure", snapshots: true, sources: false }
      : "off",
    screenshot: "only-on-failure",
    // The trace already holds a screencast; a video only slows every test.
    video: "off",
    // Reached only on failure, so doubling it on a contended runner costs a
    // green run nothing; the per-test timeout still bounds a stuck test.
    actionTimeout: isCI ? 30_000 : 15_000,
    navigationTimeout: 30_000,
  },

  // A test that legitimately needs longer says so with `test.slow()`; the
  // budget is not padded for it.
  timeout: 90_000,

  expect: {
    timeout: 60_000,
  },

  projects: [
    {
      name: "chromium",
      testMatch: /.*\.e2e\.ts/,
      // No `storageState` here: it would override the user fixture's, which
      // signs the default `page` in as the worker's own user.
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer:
    skipServer || reuseServer
      ? undefined
      : {
          // CI's e2e job boots the standalone build the build job handed
          // over (`node .ci/next-runtime/server.js`), not a build of its own.
          command:
            process.env.PLAYWRIGHT_SERVER_COMMAND ??
            (isCI ? "pnpm exec next start" : "pnpm exec next dev"),
          // Playwright defaults to this file's directory, where there is no app.
          cwd: path.join(__dirname, "..", ".."),
          url: baseURL,
          reuseExistingServer: !isCI,
          timeout: 120_000,
          env: {
            // Every worker signs in from this one machine, and a parallel
            // burst trips Better Auth's per-IP limit with 429s that fail
            // unrelated specs. Read only by the server Playwright starts,
            // and never honoured on a production deploy
            // (src/server/better-auth/config.ts).
            E2E_DISABLE_AUTH_RATE_LIMIT: "true",
          },
        },
});
