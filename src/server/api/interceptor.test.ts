import { ORPCError } from "@orpc/server";
import { APIError } from "better-auth/api";
import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { ERROR_WHYS } from "@/lib/errors";

import { createObservedContext, interceptErrors } from "./interceptor";

const { captureExceptionWithScope, getSession, requestLog } = vi.hoisted(
  () => ({
    captureExceptionWithScope: vi.fn((): string | null => "event-1"),
    getSession: vi.fn(
      async (): Promise<{ headers: Headers; response: unknown }> =>
        await Promise.resolve({ headers: new Headers(), response: null })
    ),
    requestLog: { error: vi.fn(), set: vi.fn() },
  })
);

vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));
vi.mock("@/server/better-auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/server/api/utils/logger", () => ({
  safeRequestLogger: () => requestLog,
}));

const context = { headers: new Headers({ "x-request-id": "req-1" }) };
const path = ["post", "create"];

async function intercept(failure: Error) {
  return await interceptErrors({
    context,
    next: async () => await Promise.reject(failure),
    path,
  });
}

/** What the promise rejected with; a resolution fails the test. */
async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("interceptErrors", () => {
  test("returns the procedure's result untouched", async () => {
    await expect(
      interceptErrors({
        context,
        next: async () => await Promise.resolve(7),
        path,
      })
    ).resolves.toBe(7);
  });

  test("passes a deliberate ORPCError through without reporting it", async () => {
    const refusal = new ORPCError("FORBIDDEN");

    await expect(caught(intercept(refusal))).resolves.toBe(refusal);
    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("turns a constraint violation into a typed error and logs the constraint", async () => {
    const pgError = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint: "post_name_unique",
    });

    const error = await caught(
      intercept(new DrizzleQueryError("insert", ["x"], pgError))
    );

    expect(error).toMatchObject({
      code: "CONFLICT",
      data: { procedure: "post.create", requestId: "req-1" },
    });
    expect(captureExceptionWithScope).not.toHaveBeenCalled();
    expect(requestLog.set).toHaveBeenCalledExactlyOnceWith({
      outcome: { code: "CONFLICT", constraint: "post_name_unique" },
    });
  });

  test("reports anything else once and answers a curated 500", async () => {
    const defect = new Error('relation "post" does not exist', {
      cause: Object.assign(new Error("refused"), { code: "ECONNREFUSED" }),
    });

    const error = await caught(intercept(defect));

    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(defect, {
      procedure: "post.create",
      requestId: "req-1",
    });
    expect(error).toBeInstanceOf(ORPCError);
    expect(error).not.toHaveProperty("cause");
    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong.",
      data: {
        why: ERROR_WHYS.NETWORK,
        fix: "Try again. If it keeps failing, contact support with the code shown.",
        eventId: "event-1",
        requestId: "req-1",
        procedure: "post.create",
      },
    });
    expect(requestLog.error).toHaveBeenCalledExactlyOnceWith(defect, {
      outcome: { code: "INTERNAL_SERVER_ERROR", eventId: "event-1" },
    });
  });

  test("records a thrown non-Error on the request log as text", async () => {
    await caught(
      interceptErrors({
        context,
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the case under test
        next: async () => await Promise.reject("plain string"),
        path,
      })
    );

    expect(requestLog.error).toHaveBeenCalledWith("plain string", {
      outcome: { code: "INTERNAL_SERVER_ERROR", eventId: "event-1" },
    });
  });

  test("omits the event id when Sentry sent nothing", async () => {
    captureExceptionWithScope.mockReturnValueOnce(null);

    const error = await caught(intercept(new Error("boom")));

    expect(error).toMatchObject({
      data: { eventId: undefined, why: undefined },
    });
    expect(requestLog.error).toHaveBeenCalledExactlyOnceWith(
      new Error("boom"),
      { outcome: { code: "INTERNAL_SERVER_ERROR", eventId: undefined } }
    );
  });
});

describe("createObservedContext", () => {
  test("builds the context from the request, reporting nothing", async () => {
    const resHeaders = new Headers();

    const created = await createObservedContext({
      headers: context.headers,
      resHeaders,
    });

    expect(created).toMatchObject({
      headers: context.headers,
      resHeaders,
      session: null,
    });
    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("reports a failure and rethrows it", async () => {
    const failure = new Error("pool exhausted");
    getSession.mockRejectedValueOnce(failure);

    await expect(
      createObservedContext({ headers: context.headers })
    ).rejects.toBe(failure);
    expect(captureExceptionWithScope).toHaveBeenCalledWith(failure, {
      action: "Api.create_context",
      requestId: "req-1",
    });
  });

  test("leaves Better Auth's own APIError to its logger", async () => {
    const failure = new APIError("INTERNAL_SERVER_ERROR");
    getSession.mockRejectedValueOnce(failure);

    await expect(
      createObservedContext({ headers: new Headers() })
    ).rejects.toBe(failure);
    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });
});
