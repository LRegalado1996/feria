import { afterEach, describe, expect, test, vi } from "vitest";

import { isBotRequest } from "./bot-check";

const { checkBotId, logSet, safeRequestLogger } = vi.hoisted(() => {
  // The request's wide-event logger: `set` is what lands on its log line.
  const set = vi.fn<(fields: unknown) => void>();

  return {
    checkBotId: vi.fn<() => Promise<{ isBot: boolean }>>(),
    logSet: set,
    safeRequestLogger: vi.fn<() => { set: typeof set } | undefined>(() => ({
      set,
    })),
  };
});

// BotID's server check reads Vercel's signed headers, which only exist on a
// deployment: its verdict is the double's.
vi.mock("botid/server", () => ({ checkBotId }));

vi.mock("@/server/api/utils/logger", () => ({ safeRequestLogger }));

afterEach(() => {
  vi.unstubAllEnvs();
});

function setup({ isBot = false }: { isBot?: boolean } = {}) {
  checkBotId.mockResolvedValue({ isBot });

  return { checkBotId, logSet };
}

describe("isBotRequest", () => {
  test.each([
    ["VERCEL unset", {}],
    ["VERCEL empty", { VERCEL: "" }],
    ["VERCEL=0", { VERCEL: "0" }],
    ["VERCEL=true, which Vercel never sets", { VERCEL: "true" }],
  ])(
    "off Vercel (%s) lets the request through without asking BotID, and logs the skip",
    async (_case, env: Record<string, string>) => {
      const { checkBotId: check, logSet: set } = setup({ isBot: true });

      await expect(isBotRequest(env)).resolves.toBe(false);
      expect(check).not.toHaveBeenCalled();
      expect(set).toHaveBeenCalledExactlyOnceWith({ botCheck: "skipped" });
    }
  );

  test.each([
    ["a bot", true],
    ["a person", false],
  ])(
    "on Vercel answers BotID's verdict for %s, with nothing logged as skipped",
    async (_case, isBot) => {
      const { checkBotId: check, logSet: set } = setup({ isBot });

      await expect(isBotRequest({ VERCEL: "1" })).resolves.toBe(isBot);
      expect(check).toHaveBeenCalledExactlyOnceWith();
      expect(set).not.toHaveBeenCalled();
    }
  );

  test("lets a BotID failure reach the caller instead of answering for it", async () => {
    const { checkBotId: check } = setup();
    check.mockRejectedValue(new Error("BotID unreachable"));

    await expect(isBotRequest({ VERCEL: "1" })).rejects.toThrow(
      "BotID unreachable"
    );
  });

  test("skips quietly outside a request, where there is no log line", async () => {
    setup();
    safeRequestLogger.mockReturnValueOnce(undefined);

    await expect(isBotRequest({})).resolves.toBe(false);
  });

  test("reads process.env by default", async () => {
    const { checkBotId: check } = setup({ isBot: true });
    vi.stubEnv("VERCEL", "1");

    await expect(isBotRequest()).resolves.toBe(true);
    expect(check).toHaveBeenCalledExactlyOnceWith();
  });
});
