import { ORPCError, os } from "@orpc/server";
import { z } from "zod";

import { appErrorDataSchema } from "@/lib/errors";
import { safeRequestLogger } from "@/server/api/utils/logger";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";

/**
 * `resHeaders` and `signal` exist only on an HTTP request: the RSC `caller`
 * has no response to add headers to.
 */
export const createORPCContext = async (opts: {
  headers: Headers;
  /** Headers the response carries; `ResponseHeadersPlugin` merges them in. */
  resHeaders?: Headers;
  signal?: AbortSignal;
}) => {
  // When the session cache cookie is missing or expired, Better Auth reads the
  // database and mints a fresh one on its response headers. Forwarded, the
  // browser keeps a valid cache; dropped, every later request reads the
  // database again.
  const { headers: authHeaders, response: session } = await auth.api.getSession(
    { headers: opts.headers, returnHeaders: true }
  );
  for (const cookie of authHeaders.getSetCookie()) {
    opts.resHeaders?.append("set-cookie", cookie);
  }
  return {
    db,
    session,
    ...opts,
  };
};

/**
 * The error contract every procedure shares. Handlers throw
 * `errors.NOT_FOUND({ message, data: { fix } })` or the equivalent
 * `new ORPCError("NOT_FOUND", …)`, and clients narrow on `error.code` with
 * `data` typed. `data` is sent to the browser: never PII, tokens or stacks.
 */
const o = os.$context<Awaited<ReturnType<typeof createORPCContext>>>().errors({
  BAD_REQUEST: { data: appErrorDataSchema.optional() },
  UNAUTHORIZED: { data: appErrorDataSchema.optional() },
  FORBIDDEN: { data: appErrorDataSchema.optional() },
  NOT_FOUND: { data: appErrorDataSchema.optional() },
  CONFLICT: { data: appErrorDataSchema.optional() },
  // `retryAfter` in seconds, for a countdown instead of a blind retry.
  TOO_MANY_REQUESTS: {
    data: appErrorDataSchema.extend({ retryAfter: z.number().int().min(1) }),
  },
});

/** Each call's procedure and duration, on the request's wide event. */
const timingMiddleware = o.middleware(async ({ next, path }) => {
  const start = performance.now();
  try {
    return await next();
  } finally {
    safeRequestLogger()?.set({
      orpc: {
        procedure: path.join("."),
        durationMs: Math.round(performance.now() - start),
      },
    });
  }
});

export const publicProcedure = o.use(timingMiddleware);

export const protectedProcedure = publicProcedure.use(({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: { ...context.session, user: context.session.user },
    },
  });
});
