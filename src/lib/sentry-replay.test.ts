import { afterEach, describe, expect, test, vi } from "vitest";

import { REPLAY_DELAY_MS, addReplayAfterLoad } from "./sentry-replay";

const { reportError, whenPageIdle } = vi.hoisted(() => ({
  reportError: vi.fn<(error: unknown, options: { action: string }) => null>(),
  whenPageIdle:
    vi.fn<(callback: () => void, options: { win: Window }) => void>(),
}));

vi.mock("@/lib/errors/client", () => ({ reportError }));
vi.mock("@/lib/utils/page-idle", () => ({ whenPageIdle }));

/**
 * A page that is not idle yet (`idle()` makes it so), and an SDK whose
 * recorder the loader adds, or a chunk that fails.
 */
function setup({ fails = false }: { fails?: boolean } = {}) {
  vi.useFakeTimers();
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

  addReplayAfterLoad(load, window);
  const [[onIdle, options] = []] = whenPageIdle.mock.calls;

  return {
    addIntegration,
    failure,
    /** The page settles: what waited for it runs. */
    idle: () => {
      onIdle?.();
    },
    integration,
    load,
    options,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("addReplayAfterLoad", () => {
  test("loads the recorder only once the page has been idle for the delay, then adds it", async () => {
    const { addIntegration, idle, integration, load, options } = setup();

    // However long the page takes to settle, nothing loads before it does.
    expect(options).toEqual({ win: window });
    await vi.advanceTimersByTimeAsync(REPLAY_DELAY_MS * 3);
    expect(load).not.toHaveBeenCalled();

    idle();
    await vi.advanceTimersByTimeAsync(REPLAY_DELAY_MS - 1);
    expect(load).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledExactlyOnceWith();
    expect(addIntegration).toHaveBeenCalledExactlyOnceWith(integration);
  });

  test("a recorder that fails to load is reported, and nothing is added", async () => {
    const { addIntegration, failure, idle } = setup({ fails: true });

    idle();
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
