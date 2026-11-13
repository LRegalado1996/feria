import { afterEach, vi } from "vitest";

import { server } from "@/test/msw/server";

// Loaded by both projects, before `setup-dom.ts` in the `dom` one.

// No unit test opens a Postgres connection: anything that imports
// `@/server/db`, however indirectly, gets the passive Drizzle proxy. Router
// tests pass their own `mockCtx.db`; a test that needs another shape declares
// its own `vi.mock("@/server/db", ...)`.
vi.mock("@/server/db", async () => {
  const { createMockDatabase } = await import("@/server/test/context");
  return { db: createMockDatabase() };
});

// MSW starts here and nowhere else; a file adds handlers with `server.use()`.
// It starts before the test file is imported, so a client that keeps a
// reference to `fetch` at import time (Better Auth's) still goes through it.
// A request no handler answers fails instead of reaching the network.
server.listen({ onUnhandledRequest: "error" });

afterEach(() => {
  // One file's `server.use()` overrides never outlive its test.
  server.resetHandlers();
  // A test that froze the clock (`vi.setSystemTime`) or faked timers must not
  // hand them to the next test: real-timer waits (`waitFor`, `userEvent`)
  // would then time out somewhere unrelated.
  vi.useRealTimers();
});
