# Testing

Detail behind `AGENTS.md` § Testing and § Definition of done. Commands are in `AGENTS.md` § Commands.

## Test structure (Non-Negotiable)

A reader understands a test without scrolling: everything it depends on is built inside it. Unit and integration tests alike.

- `test()`, never `it()` (`vitest/consistent-test-it` fails `pnpm check`).
- A test that needs state calls `setup()` on its first line and takes all of it from the return value: context, database double, spies, the rendered UI and the actions to drive it. Options select the variant (`setup({ signedIn: false })`). A pure function called with literals needs no `setup()`.
- No mutable `let` at `describe` or module scope. `beforeEach`/`afterEach` only clean up (restore a global, delete the rows a file created), never build state for the next test.
- `describe` only groups, by procedure or feature, one level deep. Never nest one to share setup.
- A literal that appears in more than 2 tests becomes a factory with overrides (`makePost({ name: "x" })`).
- Cases that differ only in data are one `test.each` table, the expected value a column of it.
- `vi.mock()` stays at module level: Vitest hoists it above the imports. A value its factory needs comes from `vi.hoisted()`.

```ts
function setup({ signedIn = true } = {}) {
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();

  return {
    db: mockCtx.db,
    create: async (input: unknown) =>
      await call(postRouter.create, input as never, {
        context: mockCtx as never,
      }),
  };
}

test("refuses a signed-out caller before touching the database", async () => {
  const { db, create } = setup({ signedIn: false });

  await expect(create({ name: "Hello" })).rejects.toMatchObject({
    code: "UNAUTHORIZED",
    message: "Unauthorized",
  });
  expect(db.$.insert).not.toHaveBeenCalled();
});
```

## Falsifiability (Non-Negotiable)

Coverage proves the code ran, not that it is right. **A test must fail if the rule it names is deleted or inverted.** Before committing one, ask: "if I broke this rule, would this test go red?" If not, it is vacuous.

Banned, because each stays green with the rule broken:

- **Execution-only hook tests:** `isSuccess` as the only assertion, or a mocked `[]`/`{}` payload. Answer with a non-empty payload and assert the exact fields and the side effect (the cache, the request the server received).
- **Argument-blind spies:** `toHaveBeenCalled()`, `toHaveBeenCalledTimes(n)` or `toHaveBeenCalledOnce()` without the arguments. Use `toHaveBeenCalledWith(…)` or `toHaveBeenCalledExactlyOnceWith(…)`. `not.toHaveBeenCalled()` is fine: nothing happened is the claim. Lint flags the blind forms, but its fixer writes a zero-argument `toHaveBeenCalledWith()` (the `zero-argument-called-with` ratchet stops it): fix these by hand.
- **Error class only:** `rejects.toThrow(ORPCError)`, `rejects.toThrow()`, `toBeInstanceOf(Error)`. Pin the code and the message: `rejects.toMatchObject({ code: "NOT_FOUND", message: "Post not found" })`.
- **Negations that any other outcome satisfies:** `not.toMatchObject({ code: "FORBIDDEN" })`, `resolves.not.toThrow()`. Assert the exact value.
- **Label without value:** scope to the row or `data-testid` and assert the value bound to the label (`toHaveTextContent("2 posts")`).
- **Shape without contents:** `toHaveLength(n)`, `toBeDefined()`, `toBeInstanceOf(X)` or `typeof` alone. Assert the elements and the fields.

And required:

- **Boundaries:** zero and empty, the exact threshold and both sides of it, a default and its override, duplicates and over-limit input.
- **Determinism:** freeze the clock (`vi.setSystemTime(date)`) and assert literals; never compute the expected value from the live clock. Unique test data comes from a counter, a sequence or `randomUUID()`, never a short random suffix (`Math.random()`, `Date.now() % n`): those collide often enough to fail a run every few hundred.
- **The real seam:** a double that answers whatever it is asked hides the bug the test exists for. Assert what the double received (the SQL through `renderQuery`, the request through the MSW resolver), key its answers by input rather than call order, and default `setup()` to the least privileged caller so "refuses X" tests can fail. Hydration bugs need a hydrating render (`collectHydrationErrors`), not `render`.
- **Rejections attached where they start:** `const pending = expect(p).rejects…` at the line that creates `p`, then advance timers. A rejection that lands before its handler fails the run even when every test passes.
- **No real personal data** in fixtures: names, emails and ids are invented.
- **Proof in the PR:** the pull request's Falsifiability section names the mutation that turns each new test red. Revert the production change, watch the test fail, restore it.

## Unit tests

- Co-located `*.test.{ts,tsx}`. Vitest + Testing Library + `@testing-library/user-event`, configured in `vitest.config.ts`.
- `*.test.ts` runs in Node (project `node`) and `*.test.tsx` in happy-dom (project `dom`). A test that renders React is named `.tsx`; any other test that needs the other environment is listed by path in the config's exception lists.
- Setup: `src/test/setup-common.ts` runs for both projects (the MSW server, the default `@/server/db` double, real timers restored after every test), `src/test/setup-dom.ts` for `dom` only (jest-dom matchers, Testing Library cleanup and its async timeout).
- Thresholds: 100% statements, functions and lines over every file in `src/`, imported by a test or not, minus the commented exclude list in `vitest.config.ts` (tests, declarations, re-export barrels, the test harness, e2e, `env.js`, schema, the seed's CLI entry). A file no test loads counts as 0%. `pnpm test:unit:coverage` and CI enforce them, unsharded.
- Isolation is on: every file gets its own module registry, so one file's `vi.mock` never decides another's imports.
- A `vi.hoisted()` spy lives as long as the file, so without help its call history would too: an earlier test's call could satisfy a later `waitFor(() => expect(spy).toHaveBeenCalledWith(x))` before the awaited thing happened. `clearMocks` clears every spy's history before each test; implementations stay, so a test that depends on a `mockResolvedValue` sets it itself (in its `setup()`) rather than inheriting one.
- Retries are 0. A failure is a defect report: find the race, never re-run until green or pad a timeout. The CI-only longer `testTimeout`/`hookTimeout` are hang detectors for a contended runner.
- No snapshots: explicit assertions only.
- Mock context: `createMockContext()` / `createUnauthenticatedMockContext()` from `@/server/test/context`.
- Drizzle: `mockCtx.db` is `createMockDatabase()`, a `Proxy` double that needs no table or chain step listed. Configure and inspect relational reads on `db.query.<model>.findFirst/findMany` and builder chains on `db.$["<operation>.<step>"]` (`$["insert.values"]`, `$["insert.returning"]`, `$.insert`). Unconfigured, `findFirst` resolves to `undefined` and `findMany` or any chain to `[]`; `db.transaction(fn)` runs `fn` with the same double.
- No unit test opens a Postgres connection: `setup-common.ts` mocks `@/server/db` with that double for every file. A file that needs another shape declares its own `vi.mock("@/server/db", ...)`; `src/server/db/index.test.ts` unmocks it to test the real module.
- HTTP goes through MSW: never stub `fetch` or fake a client's responses inside a `vi.mock` factory. `setup-common.ts` starts the server once and resets handlers after every test, so a file never calls `listen`/`close`; it adds handlers with `server.use(...)` from `@/test/msw`. A request no handler answers fails the test. Defaults: Better Auth's `get-session` answers `null` (signed out), sign-in and sign-up succeed.
- oRPC from hooks and components: mock `@/lib/orpc/client` with `orpcClientMock` from `@/test/mocks/orpc-client`, whose calls are real requests, and answer them with `createOrpcHandler("post.create", resolve)` or `createOrpcErrorHandler(path, { code, message, status, data })`. A `vi.fn()` resolver is the spy on the input the client sent. The mock keeps the hook's own `onMutate`/`onSettled`, so cache effects stay testable.
- Hooks: `createQueryWrapper()` from `@/test/setup-helpers`, a fresh QueryClient with retries off, exposed as `wrapper.queryClient`.
- Navigation: spy on `window.location.assign` (`vi.spyOn(window.location, "assign").mockImplementation(() => undefined)`); auth changes reload the page instead of calling the router (`docs/agents/nextjs.md` § Navigation).
- Module mocking: `vi.mock()`, which Vitest hoists above the imports, so the module under test is imported statically. A value the factory uses comes from `vi.hoisted()`.
- Clock: `vi.setSystemTime(date)` freezes `Date` for the test; `setup-common.ts` restores it.
- Hydration: `collectHydrationErrors(element, { serverNowMs, clientNowMs })` from `@/test/hydration` server-renders at one instant, hydrates at a later one and returns React's mismatch errors; `render` never hydrates (`docs/agents/nextjs.md` § Hydration).
- Globals happy-dom lacks: `stubIntersectionObserver()` from `@/test/intersection-observer` returns the observers to drive by hand. `vi.stubGlobal` ends with its test (`unstubGlobals`).
- oRPC procedures: `call()` from `@orpc/server` with a mock context.

## Integration tests

- Co-located `*.integration.test.{ts,tsx}`. Vitest (`vitest.integration.config.ts`) against a real PostgreSQL database.
- Cover real database operations, auth flows and cross-service interactions. A multi-step write also gets the two-writer test in `docs/agents/database.md`.
- **A database per worker.** `src/server/test/integration-global-setup.ts` clones the migrated database in `DATABASE_URL` once per Vitest worker (`<db>_w1` … `<db>_wN`, N = `min(8, cores)`) and drops the clones at the end; `integration-worker-database.ts` points each worker at its own. Files running at the same time never share a row, so they run in parallel. Cloning needs the template idle, so the setup closes other connections to it (a dev server's pool reconnects on its next query), and a second run against the same database waits for the first (a session advisory lock, released if a run dies).
- **Fails closed.** No `DATABASE_URL`, no run: the global setup throws instead of skipping. Never `describe.skipIf(!dbAvailable)`: a broken database must be a red job, not a green one with zero tests.
- **Own your rows.** Files that share a worker run back to back against one clone, so every file seeds what it reads (a fresh user per test: `randomUUID()` in the email), asserts only on its own rows (filter the feed by the ids it created), and deletes what it created in `afterEach` by the captured ids (deleting a user cascades to its sessions, accounts and posts). Never by name prefix or `LIKE`.
- CI runs them in their own job, against a Postgres service, in parallel with the unit tests.
- Locally: `pnpm test:integration` starts this worktree's Postgres first. The config reads `DATABASE_URL` from `.env` unless it is already exported.

## E2E tests

Readiness helpers, the interaction races and how to diagnose a failing spec: `src/e2e/AGENTS.md`. Retries are 0 there too.

- Playwright with Chromium. Config in `src/e2e/playwright.config.ts`.
- Page objects in `src/e2e/page-objects/`, fixtures in `src/e2e/fixtures/`, tests in `src/e2e/tests/`.
- Test files: `*.e2e.ts`.
- Preferred selector: `getByTestId`. If the target element lacks a `data-testid`, add one to the component first.
- Also use `getByRole`, `getByLabel`, `getByText` where semantically appropriate. Never raw CSS selectors.
- No fixed waits: `page.waitForTimeout` proves nothing finished. Wait for the rendered result or the completed response. Only when elapsed time is itself the assertion, keep the window with a trailing `// e2e-elapsed-time: <why>`. The `e2e-fixed-delay` ratchet enforces it (`docs/agents/ci.md` § Structure and ratchets), and `e2e-networkidle` keeps `networkidle` out: an idle network is not a hydrated page.
- Fully parallel, one user per worker (`fixtures/user.fixture.ts`): a spec asserts only on rows it created and the `db` fixture deletes them by their captured ids (`src/e2e/AGENTS.md`).
- CI runs e2e as one job against the build job's standalone output (`PLAYWRIGHT_SERVER_COMMAND`) and uploads the HTML report only when it fails (`docs/agents/ci.md` § Pipeline).
- In a worktree, Playwright reuses the app already running at `E2E_BASE_URL` (from `.env`), so run `pnpm dev` first and then `pnpm e2e`. Its fallback `next dev` listens on port 3000, not on the worktree's port.
