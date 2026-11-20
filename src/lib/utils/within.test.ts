import { describe, expect, test, vi } from "vitest";

import { within } from "./within";

const LIMIT = 2000;

/** A promise the test settles by hand, raced against the limit on fake timers. */
function setup() {
  vi.useFakeTimers();
  const { promise, reject, resolve } = Promise.withResolvers<string>();
  const raced = within(promise, LIMIT, "The lookup");
  // Read before the test advances the clock, so an early rejection is not
  // reported as unhandled.
  const outcome = raced.then(
    (value) => ({ value }),
    (error: unknown) => ({ error })
  );

  return { outcome, reject, resolve };
}

describe("within", () => {
  test("an answer just before the limit is the answer, and leaves no timer behind", async () => {
    const { outcome, resolve } = setup();

    await vi.advanceTimersByTimeAsync(LIMIT - 1);
    resolve("found");

    await expect(outcome).resolves.toEqual({ value: "found" });
    expect(vi.getTimerCount()).toBe(0);
  });

  test("no answer by the limit rejects, naming what took too long", async () => {
    const { outcome } = setup();

    await vi.advanceTimersByTimeAsync(LIMIT);

    await expect(outcome).resolves.toEqual({
      error: new Error(`The lookup took over ${LIMIT} ms`),
    });
  });

  test("a failure before the limit is the failure itself", async () => {
    const { outcome, reject } = setup();
    const outage = new Error("connection refused");

    reject(outage);

    await expect(outcome).resolves.toEqual({ error: outage });
    expect(vi.getTimerCount()).toBe(0);
  });
});
