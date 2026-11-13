import path from "node:path";

import { defineConfig } from "vitest/config";

const isCI = !!process.env.CI;
const alias = { "@": path.resolve(import.meta.dirname, "./src") };

// Plain TypeScript tests run in Node and TSX tests in happy-dom. An exception
// is listed here by path (relative to the repo root), so a test cannot silently
// pay for DOM emulation it does not need, or lose the DOM it does.
const DOM_DEPENDENT_TYPESCRIPT_TESTS: string[] = [];
const NODE_SAFE_TSX_TESTS: string[] = [];

// Integration tests need Postgres: they run from vitest.integration.config.ts.
const SHARED_EXCLUDE = ["**/*.integration.test.*"];

const sharedTest = {
  // Unit tests never depend on a real environment. `@t3-oss/env-nextjs`
  // validates server variables once `window` is gone, so the `node` project
  // would otherwise fail on a fresh checkout with nothing exported. Nothing
  // connects: the database URL is a stub that only has to parse.
  env: {
    SKIP_ENV_VALIDATION: "true",
    BETTER_AUTH_URL: "http://localhost:3000",
    DATABASE_URL: "postgresql://localhost:5432/stub",
  },
  // `pool` does not inherit from the root config, so it is set per project.
  // Worker threads are cheaper to spawn than the default child processes.
  pool: "threads" as const,
  // Hang detectors, not performance budgets: a saturated CI runner can take
  // many times longer than a laptop on a healthy test.
  testTimeout: isCI ? 60_000 : 5000,
  hookTimeout: isCI ? 60_000 : 10_000,
  // A failure is a defect report. A retry turns a real race into a green run.
  retry: 0,
  // Every file gets a fresh module registry: with isolation off, one file's
  // `vi.mock` of a shared module decides what another file imports, and the
  // result depends on how files are packed into workers.
  isolate: true,
  globals: false,
  // evlog's ESM imports `next/server` without an extension, which Next's
  // bundler resolves and Node's loader does not; inlined, Vite resolves it.
  server: { deps: { inline: ["evlog"] } },
  // Spy call history is cleared before every test (implementations stay), so
  // a `waitFor(() => expect(spy).toHaveBeenCalledWith(x))` can only be
  // satisfied by a call from the test it is in.
  clearMocks: true,
  // A `vi.stubGlobal` (IntersectionObserver, matchMedia) or `vi.stubEnv` ends
  // with its test.
  unstubGlobals: true,
  unstubEnvs: true,
};

export default defineConfig({
  resolve: { alias },
  test: {
    // Set here and not as `--reporter` flags, so CI and local runs share them.
    reporters: ["default"],
    // Console output from passing tests is noise; a failing test still prints
    // everything it logged. `--silent=false` shows it for a green run.
    silent: "passed-only",
    projects: [
      {
        resolve: { alias },
        test: {
          ...sharedTest,
          name: "node",
          environment: "node",
          setupFiles: ["./src/test/setup-common.ts"],
          include: ["src/**/*.test.ts", ...NODE_SAFE_TSX_TESTS],
          exclude: [...SHARED_EXCLUDE, ...DOM_DEPENDENT_TYPESCRIPT_TESTS],
        },
      },
      {
        resolve: { alias },
        test: {
          ...sharedTest,
          name: "dom",
          environment: "happy-dom",
          setupFiles: ["./src/test/setup-common.ts", "./src/test/setup-dom.ts"],
          include: ["src/**/*.test.tsx", ...DOM_DEPENDENT_TYPESCRIPT_TESTS],
          exclude: [...SHARED_EXCLUDE, ...NODE_SAFE_TSX_TESTS],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Every source file counts, imported by a test or not: without an
      // `include`, the percentage covers only the files tests happen to load.
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Tests and type declarations are not product code.
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
        // Re-export barrels hold no logic (konsistent keeps component barrels
        // pure). An `index.ts` with code in it stays counted.
        "src/app/_components/**/index.ts",
        "src/lib/hooks/*/index.ts",
        // Test harness: setup files, MSW, mocks and the mock context.
        "src/test/**",
        "src/server/test/**",
        // Playwright's tree, run by `pnpm e2e`.
        "src/e2e/**",
        // Declarations with no behaviour of their own: env validation is
        // `@t3-oss/env-nextjs`'s, and Drizzle tables are exercised by the
        // integration tests.
        "src/env.js",
        "src/server/db/schema/**",
        // `pnpm db:seed`'s entry: it only wires the app's db and auth into
        // `seed.ts`, which is tested, and closes the pool.
        "src/server/db/run-seed.ts",
      ],
      // Unconditional: the suite runs unsharded, so every `--coverage` run
      // reports on the whole project and the gate always means the same thing.
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
