import { ORPCError } from "@orpc/client";
import { describe, expect, test, vi } from "vitest";

import { onRequestError } from "./instrumentation";

const sentry = vi.hoisted(() => {
  const scope = { setTags: vi.fn() };
  return {
    captureRequestError: vi.fn(),
    scope,
    serverConfigLoaded: vi.fn(),
    withIsolationScope: vi.fn((callback: (s: typeof scope) => void) => {
      callback(scope);
    }),
  };
});

vi.mock("@sentry/nextjs", () => sentry);

vi.mock("../sentry.server.config", () => {
  sentry.serverConfigLoaded();
  return {};
});

const request = { path: "/", method: "GET", headers: {} };
const context = {
  routerKind: "App Router",
  routePath: "/posts/[id]",
  routeType: "render",
  revalidateReason: undefined,
} as const;

/**
 * A fresh module registry per call: the mocked config's factory, which records
 * the load, runs once per registry, so a cached import would read as "not
 * loaded" whatever `register` did.
 */
async function registerFresh() {
  vi.resetModules();
  const { register } = await import("./instrumentation");
  await register();
}

describe("register", () => {
  test("loads the server Sentry config on the Node runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    await registerFresh();

    expect(sentry.serverConfigLoaded).toHaveBeenCalledExactlyOnceWith();
  });

  test("loads nothing on any other runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");

    await registerFresh();

    expect(sentry.serverConfigLoaded).not.toHaveBeenCalled();
  });
});

describe("onRequestError", () => {
  test("captures a server error tagged with where it happened", async () => {
    const error = Object.assign(new Error("boom"), { digest: "123" });

    await onRequestError(error, request, context);

    expect(sentry.scope.setTags).toHaveBeenCalledExactlyOnceWith({
      digest: "123",
      route_path: "/posts/[id]",
      route_type: "render",
    });
    expect(sentry.captureRequestError).toHaveBeenCalledExactlyOnceWith(
      error,
      request,
      context
    );
  });

  test.each([
    ["a thrown non-object", "not an error"],
    ["a non-string digest", { digest: 42 }],
  ])("captures %s with the digest tag left empty", async (_case, thrown) => {
    await onRequestError(thrown, request, context);

    expect(sentry.scope.setTags).toHaveBeenCalledExactlyOnceWith({
      digest: undefined,
      route_path: "/posts/[id]",
      route_type: "render",
    });
    expect(sentry.captureRequestError).toHaveBeenCalledExactlyOnceWith(
      thrown,
      request,
      context
    );
  });

  test("skips a typed business error", async () => {
    await onRequestError(new ORPCError("NOT_FOUND"), request, context);

    expect(sentry.scope.setTags).not.toHaveBeenCalled();
    expect(sentry.captureRequestError).not.toHaveBeenCalled();
  });
});
