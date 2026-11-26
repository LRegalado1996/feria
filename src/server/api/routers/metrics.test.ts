import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import {
  createMockContext,
  createUnauthenticatedMockContext,
} from "@/server/test/context";

import { metricsRouter } from "./metrics";

// The router is the request's filters → the day and the client's bucket →
// the count, after the response. The queries are
// `src/server/services/metrics.test.ts`'s, the bucket's hash
// `utils/client-key.test.ts`'s and the bot list `utils/known-bot.test.ts`'s.

const services = vi.hoisted(() => ({
  countProductView: vi.fn(async () => "counted"),
  countStoreVisit: vi.fn(async () => "counted"),
  // The work handed past the response, kept for the test to start as the
  // platform would once the answer is sent.
  keepAlivePastResponse:
    vi.fn<
      (work: () => Promise<unknown>, options: { action: string }) => void
    >(),
  logSet: vi.fn<(fields: unknown) => void>(),
  // A stand-in for the keyed hash, made of what the router handed it, so a
  // bucket of the wrong day, subject or headers would show.
  metricsBucket: vi.fn(
    (headers: Headers, scope: { day: string; subject: string }) => {
      const ip = headers.get("x-real-ip");

      return ip === null ? null : `bucket:${ip}:${scope.day}:${scope.subject}`;
    }
  ),
}));

vi.mock("@/server/services/metrics", () => ({
  countProductView: services.countProductView,
  countStoreVisit: services.countStoreVisit,
}));

vi.mock("@/server/api/utils/client-key", () => ({
  metricsBucket: services.metricsBucket,
}));

vi.mock("@/server/api/utils/keep-alive-past-response", () => ({
  keepAlivePastResponse: services.keepAlivePastResponse,
}));

vi.mock("@/server/api/utils/logger", () => ({
  safeRequestLogger: () => ({ set: services.logSet }),
}));

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
// Montevideo is UTC-3 all year: its midnight is 03:00 UTC.
const BEFORE_MIDNIGHT = "2026-12-06T02:59:59.999Z";

/**
 * A request as the storefront sends it: a shopper's browser, signed out,
 * from an address, at `now`. `signedIn` is an admin's browser,
 * `sessionUnreadable` a session that failed to read.
 */
function setup({
  ip = "203.0.113.7",
  now = BEFORE_MIDNIGHT,
  sessionUnreadable = false,
  signedIn = false,
  userAgent = CHROME,
}: {
  ip?: string | null;
  now?: string;
  sessionUnreadable?: boolean;
  signedIn?: boolean;
  userAgent?: string | null;
} = {}) {
  vi.setSystemTime(new Date(now));
  const { mockCtx } = signedIn
    ? createMockContext()
    : createUnauthenticatedMockContext();
  const headers = new Headers();

  if (ip !== null) {
    headers.set("x-real-ip", ip);
  }

  if (userAgent !== null) {
    headers.set("user-agent", userAgent);
  }

  mockCtx.headers = headers;

  if (sessionUnreadable) {
    mockCtx.sessionFailure = { error: new Error("database unreachable") };
  }

  return {
    db: mockCtx.db,
    /** What the request's log line says of the count. */
    logged: () =>
      services.logSet.mock.calls
        .map(([fields]) => fields)
        .filter((fields) => Object.hasOwn(fields as object, "metrics")),
    /** Runs the work handed past the response, as the platform would. */
    afterResponse: async () => {
      await Promise.all(
        services.keepAlivePastResponse.mock.calls.map(
          async ([work]) => await work()
        )
      );
    },
    countView: async (input: unknown) => {
      await call(metricsRouter.countView, input as never, {
        context: mockCtx as never,
      });
    },
    countVisit: async () => {
      await call(metricsRouter.countVisit, undefined, {
        context: mockCtx as never,
      });
    },
  };
}

describe("metrics.countView", () => {
  test.each([
    [
      "the last instant before midnight in Montevideo",
      BEFORE_MIDNIGHT,
      "2026-12-05",
    ],
    ["midnight in Montevideo", "2026-12-06T03:00:00.000Z", "2026-12-06"],
  ])(
    "at %s counts the view on that business day, after the response",
    async (_case, now, day) => {
      const { afterResponse, countView, db, logged } = setup({ now });

      await expect(countView({ productId: 58 })).resolves.toBeUndefined();
      await afterResponse();

      expect(services.countProductView).toHaveBeenCalledExactlyOnceWith(db, {
        bucket: `bucket:203.0.113.7:${day}:view:58`,
        day,
        productId: 58,
      });
      expect(services.keepAlivePastResponse).toHaveBeenCalledExactlyOnceWith(
        expect.any(Function),
        { action: "Metrics.count_view" }
      );
      expect(logged()).toEqual([
        { metrics: { clientLimit: "applied", outcome: "queued" } },
      ]);
    }
  );

  test("answers before the count starts, which waits for the response to be sent", async () => {
    const { afterResponse, countView, db } = setup();

    await expect(countView({ productId: 58 })).resolves.toBeUndefined();

    // Answered with the count handed past the response, not started.
    expect(services.keepAlivePastResponse).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      { action: "Metrics.count_view" }
    );
    expect(services.countProductView).not.toHaveBeenCalled();

    await afterResponse();

    expect(services.countProductView).toHaveBeenCalledExactlyOnceWith(db, {
      bucket: "bucket:203.0.113.7:2026-12-05:view:58",
      day: "2026-12-05",
      productId: 58,
    });
  });

  test("without the client's address counts with no cap, and the log line says so", async () => {
    const { afterResponse, countView, db, logged } = setup({ ip: null });

    await countView({ productId: 58 });
    await afterResponse();

    expect(services.countProductView).toHaveBeenCalledExactlyOnceWith(db, {
      bucket: null,
      day: "2026-12-05",
      productId: 58,
    });
    expect(logged()).toEqual([
      { metrics: { clientLimit: "skipped", outcome: "queued" } },
    ]);
  });

  test.each([
    ["a known bot", { userAgent: BINGBOT }, "bot"],
    ["a request with no user agent", { userAgent: null }, "bot"],
    ["a signed-in admin", { signedIn: true }, "admin"],
    [
      "a session that could not be read",
      { sessionUnreadable: true },
      "session_unreadable",
    ],
  ])(
    "counts nothing for %s, and the log line says why",
    async (_case, options, outcome) => {
      const { countView, logged } = setup(options);

      await expect(countView({ productId: 58 })).resolves.toBeUndefined();

      expect(services.keepAlivePastResponse).not.toHaveBeenCalled();
      expect(services.countProductView).not.toHaveBeenCalled();
      expect(logged()).toEqual([{ metrics: { outcome } }]);
    }
  );

  test.each([
    ["an id as text", { productId: "58" }],
    ["id zero", { productId: 0 }],
    ["an id past int4", { productId: 2_147_483_648 }],
    ["a field it does not name", { productId: 58, viewCount: 1000 }],
    ["no id", {}],
  ])("refuses %s before counting anything", async (_case, input) => {
    const { countView } = setup();

    await expect(countView(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Input validation failed",
    });
    expect(services.keepAlivePastResponse).not.toHaveBeenCalled();
  });

  test("takes the largest int4 id", async () => {
    const { afterResponse, countView, db } = setup();

    await countView({ productId: 2_147_483_647 });
    await afterResponse();

    expect(services.countProductView).toHaveBeenCalledExactlyOnceWith(db, {
      bucket: "bucket:203.0.113.7:2026-12-05:view:2147483647",
      day: "2026-12-05",
      productId: 2_147_483_647,
    });
  });
});

describe("metrics.countVisit", () => {
  test.each([
    [
      "the last instant before midnight in Montevideo",
      BEFORE_MIDNIGHT,
      "2026-12-05",
    ],
    ["midnight in Montevideo", "2026-12-06T03:00:00.000Z", "2026-12-06"],
  ])(
    "at %s counts the visit on that business day, after the response",
    async (_case, now, day) => {
      const { afterResponse, countVisit, db } = setup({ now });

      await expect(countVisit()).resolves.toBeUndefined();
      await afterResponse();

      expect(services.countStoreVisit).toHaveBeenCalledExactlyOnceWith(db, {
        bucket: `bucket:203.0.113.7:${day}:visit`,
        day,
      });
      expect(services.keepAlivePastResponse).toHaveBeenCalledExactlyOnceWith(
        expect.any(Function),
        { action: "Metrics.count_visit" }
      );
    }
  );

  test.each([
    ["a known bot", { userAgent: BINGBOT }, "bot"],
    ["a signed-in admin", { signedIn: true }, "admin"],
  ])("counts nothing for %s", async (_case, options, outcome) => {
    const { countVisit, logged } = setup(options);

    await countVisit();

    expect(services.keepAlivePastResponse).not.toHaveBeenCalled();
    expect(logged()).toEqual([{ metrics: { outcome } }]);
  });
});
