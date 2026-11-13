import { describe, expect, test, vi } from "vitest";

import { captureExceptionWithScope } from "./sentry";

const sentry = vi.hoisted(() => {
  const scope = { setContext: vi.fn(), setTag: vi.fn() };
  return {
    captureException: vi.fn(() => "event-1"),
    getClient: vi.fn((): object | undefined => ({})),
    scope,
    withScope: vi.fn((callback: (s: typeof scope) => unknown) =>
      callback(scope)
    ),
  };
});

vi.mock("@sentry/nextjs", () => sentry);

describe("captureExceptionWithScope", () => {
  test("returns null and sends nothing without a Sentry client", () => {
    sentry.getClient.mockReturnValueOnce(undefined);

    expect(captureExceptionWithScope(new Error("boom"))).toBeNull();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  test("tags the event and returns its id", () => {
    const error = new Error("boom");

    const eventId = captureExceptionWithScope(error, {
      action: "Auth.better_auth_log",
      context: { postId: 7 },
      procedure: "post.create",
      requestId: "req-1",
    });

    expect(eventId).toBe("event-1");
    expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(sentry.scope.setTag.mock.calls).toEqual([
      ["action", "Auth.better_auth_log"],
      ["procedure", "post.create"],
      ["request_id", "req-1"],
    ]);
    expect(sentry.scope.setContext).toHaveBeenCalledExactlyOnceWith("details", {
      postId: 7,
    });
  });

  test("sets no tag it was not given", () => {
    const error = new Error("boom");

    expect(captureExceptionWithScope(error)).toBe("event-1");

    expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(sentry.scope.setTag).not.toHaveBeenCalled();
    expect(sentry.scope.setContext).not.toHaveBeenCalled();
  });
});
