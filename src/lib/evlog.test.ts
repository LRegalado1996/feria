import { format } from "node:util";

import { afterEach, describe, expect, test, vi } from "vitest";

import { REDACTED } from "@/lib/redaction";
import {
  makeSessionQueryError,
  SYNTHETIC_SESSION_TOKEN,
} from "@/test/session-query-error";

const { createFsDrain } = vi.hoisted(() => ({
  createFsDrain: vi.fn(() => async () => {
    await Promise.resolve();
  }),
}));

vi.mock("evlog/fs", () => ({ createFsDrain }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Everything the wide event wrote to the console, joined. */
function captureConsole(): () => string {
  const lines: string[] = [];
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(format(...args));
    });
  }
  return () => lines.join("\n");
}

/** `@/lib/evlog` as a fresh module, built under the given NODE_ENV. */
async function loadEvlog(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  return await import("./evlog");
}

async function requestThatLogsSecrets(nodeEnv: string): Promise<string> {
  const { withEvlog } = await loadEvlog(nodeEnv);
  const { useLogger } = await import("evlog/next");
  const output = captureConsole();
  const handler = withEvlog(async (_request: Request) => {
    useLogger().set({ user: { id: "u1", token: SYNTHETIC_SESSION_TOKEN } });
    useLogger().error(makeSessionQueryError());
    return await Promise.resolve(new Response("ok"));
  });

  await handler(new Request("http://localhost/api/orpc/post/create"));
  return output();
}

describe("evlog", () => {
  test("withholds secrets before the event reaches the console", async () => {
    const output = await requestThatLogsSecrets("test");

    expect(output).toContain("post/create");
    expect(output).toContain(REDACTED);
    expect(output).not.toContain(SYNTHETIC_SESSION_TOKEN);
  });

  test("writes one JSON line per request in production", async () => {
    const output = await requestThatLogsSecrets("production");
    const event: unknown = JSON.parse(output);

    expect(event).toMatchObject({
      path: "/api/orpc/post/create",
      user: { id: "u1", token: REDACTED },
    });
    expect(output).not.toContain(SYNTHETIC_SESSION_TOKEN);
  });

  test.each([
    ["production", false],
    ["test", false],
    ["development", true],
  ])("under NODE_ENV=%s keeps a local file copy: %s", async (nodeEnv, kept) => {
    await loadEvlog(nodeEnv);

    expect(createFsDrain.mock.calls).toEqual(kept ? [[]] : []);
  });
});
