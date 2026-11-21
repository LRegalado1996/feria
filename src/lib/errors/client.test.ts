import { ORPCError } from "@orpc/client";
import { describe, expect, test, vi } from "vitest";

import { reportError } from "./client";

const sentry = vi.hoisted(() => {
  const scope = { setContext: vi.fn(), setTag: vi.fn() };
  return {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(() => "browser-event"),
    getClient: vi.fn((): object | undefined => ({})),
    scope,
    withScope: vi.fn((callback: (s: typeof scope) => unknown) =>
      callback(scope)
    ),
  };
});

vi.mock("@sentry/nextjs", () => sentry);

describe("reportError", () => {
  test("captures a defect tagged with its action and the server's ids", () => {
    const error = new ORPCError("INTERNAL_SERVER_ERROR", {
      data: {
        eventId: "server-event",
        procedure: "category.create",
        requestId: "r1",
      },
    });

    const eventId = reportError(error, {
      action: "Category.create_failed",
      context: { categoryId: 3 },
    });

    expect(eventId).toBe("browser-event");
    expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(sentry.scope.setTag.mock.calls).toEqual([
      ["action", "Category.create_failed"],
      ["procedure", "category.create"],
      ["request_id", "r1"],
      ["server_event_id", "server-event"],
    ]);
    expect(sentry.scope.setContext).toHaveBeenCalledExactlyOnceWith("details", {
      categoryId: 3,
    });
  });

  test("leaves an action breadcrumb before the event", () => {
    reportError(new ORPCError("INTERNAL_SERVER_ERROR"), {
      action: "Category.create_failed",
      context: { categoryId: 3 },
    });

    expect(sentry.addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: "action",
      level: "info",
      message: "Category.create_failed",
      data: { categoryId: 3, code: "INTERNAL_SERVER_ERROR" },
    });
    expect(sentry.addBreadcrumb.mock.invocationCallOrder[0]).toBeLessThan(
      sentry.captureException.mock.invocationCallOrder[0] ?? 0
    );
  });

  test("keeps a typed business error a breadcrumb", () => {
    expect(
      reportError(new ORPCError("UNAUTHORIZED"), {
        action: "Category.list_failed",
      })
    ).toBeNull();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: "action",
      level: "info",
      message: "Category.list_failed",
      data: { code: "UNAUTHORIZED" },
    });
  });

  test("keeps a request that never got a response a warning breadcrumb", () => {
    const eventId = reportError(new TypeError("Failed to fetch"), {
      action: "Category.list_failed",
    });

    expect(eventId).toBeNull();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledExactlyOnceWith({
      category: "action",
      level: "warning",
      message: "Category.list_failed",
      data: {},
    });
  });

  test("returns null, not a locally minted id, without a Sentry client", () => {
    sentry.getClient.mockReturnValueOnce(undefined);

    expect(reportError(new Error("boom"), { action: "App.x" })).toBeNull();
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  test("tags nothing it was not given", () => {
    const error = new Error("boom");

    expect(reportError(error, { action: "App.x" })).toBe("browser-event");

    expect(sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(sentry.scope.setTag).toHaveBeenCalledExactlyOnceWith(
      "action",
      "App.x"
    );
    expect(sentry.scope.setContext).not.toHaveBeenCalled();
  });
});
