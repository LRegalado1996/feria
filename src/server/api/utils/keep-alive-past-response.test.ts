import { describe, expect, test, vi } from "vitest";

import { keepAlivePastResponse } from "./keep-alive-past-response";

const mocks = vi.hoisted(() => ({
  after: vi.fn((_task: Promise<unknown> | (() => Promise<void>)) => undefined),
  captureExceptionWithScope: vi.fn(),
  waitUntil: vi.fn((_task: Promise<unknown>) => undefined),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("@/lib/sentry", () => ({
  captureExceptionWithScope: mocks.captureExceptionWithScope,
}));

const OUTSIDE_SCOPE = new Error(
  "`after` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context"
);

/** The promise `after()` was offered, whether it accepted it or not. */
function offeredToAfter(): Promise<unknown> | undefined {
  const task = mocks.after.mock.calls[0]?.[0];

  return typeof task === "function" ? undefined : task;
}

/** The callback `after()` was handed, to run as Next would once sent. */
function callbackAfter(): () => Promise<void> {
  const task = mocks.after.mock.calls[0]?.[0];

  if (typeof task !== "function") {
    throw new TypeError("after() was handed no callback");
  }

  return task;
}

describe("keepAlivePastResponse", () => {
  test("registers the work with after() inside a request scope", async () => {
    keepAlivePastResponse(Promise.resolve("sent"), { action: "Order.notify" });

    expect(mocks.after).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
    await offeredToAfter();
    expect(mocks.waitUntil).not.toHaveBeenCalled();
    expect(mocks.captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("falls back to waitUntil outside a request scope", async () => {
    mocks.after.mockImplementationOnce(() => {
      throw OUTSIDE_SCOPE;
    });

    keepAlivePastResponse(Promise.resolve("sent"), { action: "Order.notify" });

    // The same bounded, reporting promise `after()` refused.
    expect(mocks.waitUntil).toHaveBeenCalledExactlyOnceWith(offeredToAfter());
    await offeredToAfter();
    expect(mocks.captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("rethrows any other refusal from after()", () => {
    const refusal = new Error("after() cannot be called inside a cache scope");
    mocks.after.mockImplementationOnce(() => {
      throw refusal;
    });

    expect(() => {
      keepAlivePastResponse(Promise.resolve(), { action: "Order.notify" });
    }).toThrow(refusal);
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });

  test("reports work that fails, under its action", async () => {
    const failure = new Error("webhook refused");

    keepAlivePastResponse(Promise.reject(failure), { action: "Order.notify" });

    await offeredToAfter();
    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      failure,
      { action: "Order.notify" }
    );
  });

  test("stops waiting at the timeout and reports the overrun", async () => {
    const neverSettles = new Promise(() => {
      // never settles
    });

    keepAlivePastResponse(neverSettles, {
      action: "Order.notify",
      timeoutMs: 5,
    });

    await offeredToAfter();
    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      new Error("Order.notify was still running after 5 ms"),
      { action: "Order.notify" }
    );
  });

  test("starts work handed as a function only once the response is sent", async () => {
    const work = vi.fn(async () => await Promise.resolve("written"));

    keepAlivePastResponse(work, { action: "Metrics.count_view" });

    expect(work).not.toHaveBeenCalled();
    expect(mocks.waitUntil).not.toHaveBeenCalled();

    await callbackAfter()();

    expect(work).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("starts a function at once under waitUntil outside a request scope", async () => {
    mocks.after.mockImplementationOnce(() => {
      throw OUTSIDE_SCOPE;
    });
    const work = vi.fn(async () => await Promise.resolve("written"));

    keepAlivePastResponse(work, { action: "Metrics.count_view" });

    expect(work).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.waitUntil).toHaveBeenCalledExactlyOnceWith(
      expect.any(Promise)
    );
    await mocks.waitUntil.mock.calls[0]?.[0];
    expect(mocks.captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("reports a function that throws as it starts, under its action", async () => {
    const failure = new Error("pool exhausted");

    keepAlivePastResponse(
      () => {
        throw failure;
      },
      { action: "Metrics.count_view" }
    );
    await callbackAfter()();

    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      failure,
      { action: "Metrics.count_view" }
    );
  });

  test("rethrows any other refusal from after() for a function too", () => {
    const refusal = new Error("after() cannot be called inside a cache scope");
    mocks.after.mockImplementationOnce(() => {
      throw refusal;
    });

    expect(() => {
      keepAlivePastResponse(
        async () => {
          await Promise.resolve();
        },
        { action: "Metrics.count_view" }
      );
    }).toThrow(refusal);
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });
});
