import { ORPCError, os } from "@orpc/server";
import { z } from "zod";

import { appErrorDataSchema } from "@/lib/errors";
import { safeRequestLogger } from "@/server/api/utils/logger";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { findAdminStore } from "@/server/services/access";

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

type ORPCContext = Awaited<ReturnType<typeof createORPCContext>>;

/**
 * The error contract every procedure shares. Handlers throw
 * `errors.NOT_FOUND({ message, data: { fix } })` or the equivalent
 * `new ORPCError("NOT_FOUND", …)`, and clients narrow on `error.code` with
 * `data` typed. `data` is sent to the browser: never PII, tokens or stacks.
 */
const ERRORS = {
  BAD_REQUEST: { data: appErrorDataSchema.optional() },
  UNAUTHORIZED: { data: appErrorDataSchema.optional() },
  FORBIDDEN: { data: appErrorDataSchema.optional() },
  NOT_FOUND: { data: appErrorDataSchema.optional() },
  CONFLICT: { data: appErrorDataSchema.optional() },
  // A capability this deployment is not configured for (uploads without
  // their store, FER-051): a 503 the client explains, never a crash.
  SERVICE_UNAVAILABLE: { data: appErrorDataSchema.optional() },
  // `retryAfter` in seconds, for a countdown instead of a blind retry.
  TOO_MANY_REQUESTS: {
    data: appErrorDataSchema.extend({ retryAfter: z.number().int().min(1) }),
  },
};

const o = os.$context<ORPCContext>().errors(ERRORS);

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

/**
 * Every procedure of the admin (FER-038): any signed-in login, since every
 * login is an admin and reaches the whole admin. The login is re-read from
 * the database (a session can outlive its user for minutes) and the handler
 * gets the store, the table's one row, as `context.store`: it filters every
 * query by `context.store.id`, and no procedure takes a store from its input.
 * A missing session or login answers UNAUTHORIZED.
 *
 * The order is session, input, then the database. A later `.input()` places
 * validation after every middleware added before it; the initial index of -1
 * moves it one earlier, before the last one, so a caller without a session
 * or with a malformed input is refused before anything is read.
 */
export const adminProcedure = os
  .$context<ORPCContext>()
  .$config({ initialInputValidationIndex: -1 })
  .errors(ERRORS)
  .use(timingMiddleware)
  .use(async ({ context, next }) => {
    if (!context.session?.user) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return await next({
      context: {
        session: { ...context.session, user: context.session.user },
      },
    });
  })
  .use(async ({ context, next }) => {
    const store = await findAdminStore(context.db, context.session.user.id);

    if (!store) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return await next({ context: { store } });
  });
