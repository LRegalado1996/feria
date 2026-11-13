import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { POST } from "./route";

const { captureExceptionWithScope, getSession } = vi.hoisted(() => ({
  captureExceptionWithScope: vi.fn((): string | null => "event-1"),
  getSession: vi.fn(
    async (): Promise<{ headers: Headers; response: unknown }> =>
      await Promise.resolve({ headers: new Headers(), response: null })
  ),
}));

vi.mock("@/lib/sentry", () => ({ captureExceptionWithScope }));
vi.mock("@/server/better-auth", () => ({ auth: { api: { getSession } } }));

// The route's own behaviour, not any domain router's: one procedure per kind
// of outcome the handler has to encode.
vi.mock("@/server/api/root", async () => {
  const { ORPCError } = await import("@orpc/server");
  const { publicProcedure } = await import("@/server/api/orpc");
  const { z } = await import("zod");
  return {
    appRouter: {
      echo: publicProcedure
        .input(z.object({ text: z.string() }))
        .handler(({ context, input }) => {
          context.resHeaders?.append("x-handled-by", "echo");
          return input.text;
        }),
      refuse: publicProcedure.handler(() => {
        throw new ORPCError("UNAUTHORIZED");
      }),
      duplicate: publicProcedure.handler(() => {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }),
      crash: publicProcedure.handler(() => {
        throw new Error('relation "post" does not exist');
      }),
    },
  };
});

// `{"json":{"text":""}}`: what an echo body weighs around its text.
const ECHO_ENVELOPE_BYTES = 20;
const MAX_BODY_BYTES = 4_250_000;

function setup({
  sessionHeaders = new Headers(),
  contextFailure,
}: { sessionHeaders?: Headers; contextFailure?: Error } = {}) {
  if (contextFailure) {
    getSession.mockRejectedValueOnce(contextFailure);
  } else {
    getSession.mockResolvedValueOnce({
      headers: sessionHeaders,
      response: null,
    });
  }

  const postBody = async (
    path: string,
    body: string,
    headers?: Record<string, string>
  ) =>
    await POST(
      new NextRequest(`http://localhost:3000/api/orpc/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      })
    );

  return {
    postBody,
    post: async (
      path: string,
      input?: unknown,
      headers?: Record<string, string>
    ) => await postBody(path, JSON.stringify({ json: input }), headers),
  };
}

describe("oRPC route", () => {
  test("answers a procedure with its output and the headers it set", async () => {
    const { post } = setup();

    const response = await post("echo", { text: "hi" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: "hi" });
    expect(response.headers.get("x-handled-by")).toBe("echo");
  });

  test("carries Better Auth's renewed session cookie to the browser", async () => {
    const sessionHeaders = new Headers();
    sessionHeaders.append(
      "set-cookie",
      "better-auth.session_data=abc; Max-Age=300"
    );
    const { post } = setup({ sessionHeaders });

    const response = await post("refuse");

    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()).toEqual([
      "better-auth.session_data=abc; Max-Age=300",
    ]);
  });

  test("answers a procedure the router does not have with 404", async () => {
    const { post } = setup();

    const response = await post("missing");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  test("encodes a deliberate error as itself, unreported", async () => {
    const { post } = setup();

    const response = await post("refuse");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      json: { code: "UNAUTHORIZED", status: 401, message: "Unauthorized" },
    });
    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("answers a constraint violation with the typed 409, unreported", async () => {
    const { post } = setup();

    const response = await post("duplicate");

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      json: { code: "CONFLICT", data: { procedure: "duplicate" } },
    });
    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test("reports a defect and answers a curated 500 without its message", async () => {
    const { post } = setup();

    const response = await post("crash", undefined, {
      "x-request-id": "req-9",
    });
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain("relation");
    expect(JSON.parse(body)).toMatchObject({
      json: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong.",
        data: { eventId: "event-1", procedure: "crash", requestId: "req-9" },
      },
    });
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: 'relation "post" does not exist' }),
      { procedure: "crash", requestId: "req-9" }
    );
  });

  test("answers a malformed body with 400, not a reported 500", async () => {
    const { postBody } = setup();

    const response = await postBody("echo", "{not json");

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      json: { code: "BAD_REQUEST", status: 400 },
    });
    expect(captureExceptionWithScope).not.toHaveBeenCalled();
  });

  test.each([
    { bytes: MAX_BODY_BYTES, status: 200 },
    { bytes: MAX_BODY_BYTES + 1, status: 413 },
  ])(
    "answers a $bytes-byte body with $status (the limit is under Vercel's cap)",
    async ({ bytes, status }) => {
      const { post } = setup();

      const response = await post("echo", {
        text: "x".repeat(bytes - ECHO_ENVELOPE_BYTES),
      });

      expect(response.status).toBe(status);
    }
  );

  test("reports a context that failed to build and rethrows", async () => {
    const contextFailure = new Error("pool exhausted");
    const { post } = setup({ contextFailure });

    await expect(post("echo", { text: "hi" })).rejects.toBe(contextFailure);
    expect(captureExceptionWithScope).toHaveBeenCalledExactlyOnceWith(
      contextFailure,
      { action: "Api.create_context", requestId: undefined }
    );
  });
});
