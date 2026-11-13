import { describe, expect, test, vi } from "vitest";

import { keepAlivePastResponse } from "./keep-alive-past-response";

const mocks = vi.hoisted(() => ({
  after: vi.fn((_task: Promise<unknown>) => undefined),
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
  return mocks.after.mock.calls[0]?.[0];
}

describe("keepAlivePastResponse", () => {
  test("registers the work with after() inside a request scope", async () => {
    keepAlivePastResponse(Promise.resolve("sent"), { action: "Post.notify" });

    expect(mocks.after).toHaveBeenCalledExactlyOnceWith(expect.any(Promise));
    await offeredToAfter();
    expect(mocks.waitUntil).not.toHaveBeenCalled();
    expect(mocks.captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("falls back to waitUntil outside a request scope", async () => {
    mocks.after.mockImplementationOnce(() => {
      throw OUTSIDE_SCOPE;
    });

    keepAlivePastResponse(Promise.resolve("sent"), { action: "Post.notify" });

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
      keepAlivePastResponse(Promise.resolve(), { action: "Post.notify" });
    }).toThrow(refusal);
    expect(mocks.waitUntil).not.toHaveBeenCalled();
  });

  test("reports work that fails, under its action", async () => {
    const failure = new Error("webhook refused");

    keepAlivePastResponse(Promise.reject(failure), { action: "Post.notify" });

    await offeredToAfter();
    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      failure,
      { action: "Post.notify" }
    );
  });

  test("stops waiting at the timeout and reports the overrun", async () => {
    const neverSettles = new Promise(() => {
      // never settles
    });

    keepAlivePastResponse(neverSettles, {
      action: "Post.notify",
      timeoutMs: 5,
    });

    await offeredToAfter();
    expect(mocks.captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      new Error("Post.notify was still running after 5 ms"),
      { action: "Post.notify" }
    );
  });
});
