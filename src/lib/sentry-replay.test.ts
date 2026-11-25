import { afterEach, describe, expect, test, vi } from "vitest";

import { REPLAY_DELAY_MS, addReplayAfterLoad } from "./sentry-replay";

const { reportError } = vi.hoisted(() => ({
  reportError: vi.fn<(error: unknown, options: { action: string }) => null>(),
}));

vi.mock("@/lib/errors/client", () => ({ reportError }));

/**
 * A loaded page whose idle moment comes at once (Safari's path: the next
 * turn), and an SDK whose recorder the loader adds, or a chunk that fails.
 */
function setup({ fails = false }: { fails?: boolean } = {}) {
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", undefined);
  const integration = { name: "Replay" };
  const addIntegration = vi.fn<(added: typeof integration) => void>();
  const replayIntegration = vi.fn(() => integration);
  const failure = new Error("Loading chunk failed");
  const load = vi.fn(async () => {
    if (fails) {
      throw failure;
    }

    return { addIntegration, replayIntegration };
  });

  addReplayAfterLoad(load);

  return { addIntegration, failure, integration, load };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("addReplayAfterLoad", () => {
  test("loads the recorder only once the page has been idle for the delay, then adds it", async () => {
    const { addIntegration, integration, load } = setup();

    await vi.advanceTimersByTimeAsync(REPLAY_DELAY_MS - 1);
    expect(load).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledExactlyOnceWith();
    expect(addIntegration).toHaveBeenCalledExactlyOnceWith(integration);
  });

  test("a recorder that fails to load is reported, and nothing is added", async () => {
    const { addIntegration, failure } = setup({ fails: true });

    await vi.advanceTimersByTimeAsync(REPLAY_DELAY_MS);

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure, {
      action: "Sentry.load_replay",
    });
    expect(addIntegration).not.toHaveBeenCalled();
  });

  test("waits five seconds", () => {
    expect(REPLAY_DELAY_MS).toBe(5000);
  });
});
