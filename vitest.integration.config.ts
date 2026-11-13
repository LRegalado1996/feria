import { existsSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";

import { defineConfig } from "vitest/config";

// Locally the database URL lives in `.env`, which Vitest does not load. A value
// already exported (CI and verify:ci pass DATABASE_URL explicitly) wins over
// the file. Loaded here, before the workers start, so the global setup and
// every worker see it. Without either, the global setup refuses to run.
const dotenv = path.resolve(import.meta.dirname, ".env");

if (existsSync(dotenv)) {
  process.loadEnvFile(dotenv);
}

const isCI = !!process.env.CI;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  test: {
    name: "integration",
    environment: "node",
    include: ["src/**/*.integration.test.{ts,tsx}"],
    // One database per worker, cloned from DATABASE_URL's, so files run in
    // parallel without sharing a row. The worker setup points each worker at
    // its clone before any test file is imported.
    globalSetup: ["./src/server/test/integration-global-setup.ts"],
    setupFiles: ["./src/server/test/integration-worker-database.ts"],
    // Capped: each worker opens its own pool against one Postgres, and past
    // about 8 the run is bound by the database, not by workers. Host-relative
    // below the cap so a small runner is not oversubscribed.
    maxWorkers: Math.min(8, availableParallelism()),
    // Same policy as the unit config: hang detectors, no retries.
    testTimeout: isCI ? 60_000 : 5000,
    hookTimeout: isCI ? 60_000 : 10_000,
    retry: 0,
    // Isolation stays on: with it off, one file's `vi.mock` decides what
    // another file imports.
    isolate: true,
    globals: false,
    clearMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    reporters: ["default"],
    silent: "passed-only",
  },
});
