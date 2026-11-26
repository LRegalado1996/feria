import { ORPCError, os } from "@orpc/server";
import { isAPIError } from "better-auth/api";
import { z } from "zod";

import { appErrorDataSchema } from "@/lib/errors";
import { captureExceptionWithScope } from "@/lib/sentry";
import { safeRequestLogger } from "@/server/api/utils/logger";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { findAdminStore, findLogin } from "@/server/services/access";

/**
 * The request's session, or why it could not be read. A failed read (the
 * database unreachable for longer than the pool's retries) is not the
 * request's failure: a public procedure needs no session, so a visitor who
 * happens to be signed in still gets the page. `adminProcedure` throws the
 * failure, so the admin gets the reported 500 rather than a sign-in prompt.
 * Better Auth logs and reports the cause of its own `APIError` first
 * (`betterAuthLogger`); anything else is reported here.
 */
async function readSession(opts: { headers: Headers; resHeaders?: Headers }) {
  try {
    // When the session cache cookie is missing or expired, Better Auth reads
    // the database and mints a fresh one on its response headers. Forwarded,
    // the browser keeps a valid cache; dropped, every later request reads the
    // database again.
    const { headers: authHeaders, response: session } =
      await auth.api.getSession({ headers: opts.headers, returnHeaders: true });
    for (const cookie of authHeaders.getSetCookie()) {
      opts.resHeaders?.append("set-cookie", cookie);
    }
    return { session, sessionFailure: null };
  } catch (error) {
    if (!isAPIError(error)) {
      captureExceptionWithScope(error, {
        action: "Api.read_session",
        requestId: opts.headers.get("x-request-id") ?? undefined,
      });
    }
    return { session: null, sessionFailure: { error } };
  }
}

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
  const { session, sessionFailure } = await readSession(opts);
  return {
    db,
    session,
    sessionFailure,
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
 * The session check every signed-in procedure starts with. The order is
 * session, input, then the database: a later `.input()` places validation
 * after every middleware added before it, and the initial index of -1 moves
 * it one earlier, before the last one, so a caller without a session or with
 * a malformed input is refused before anything is read.
 */
const signedInProcedure = os
  .$context<ORPCContext>()
  .$config({ initialInputValidationIndex: -1 })
  .errors(ERRORS)
  .use(timingMiddleware)
  .use(async ({ context, next }) => {
    if (context.sessionFailure) {
      throw context.sessionFailure.error;
    }

    if (!context.session?.user) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return await next({
      context: {
        session: { ...context.session, user: context.session.user },
      },
    });
  });

/**
 * Any signed-in, enabled login (FER-015), even one still on a temporary
 * password: who is signed in (`admin.me`) and choosing its own password are
 * all it serves. The login is re-read from the database (a session can
 * outlive its user, or its disabling, for minutes) and handed over as
 * `context.login`. A missing session, or a login removed or disabled,
 * answers UNAUTHORIZED; a session that could not be read is thrown as the
 * failure it was.
 */
export const loginProcedure = signedInProcedure.use(
  async ({ context, next }) => {
    const login = await findLogin(context.db, context.session.user.id);

    if (!login) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return await next({ context: { login } });
  }
);

/**
 * Every procedure of the admin (FER-038): any signed-in, enabled login that
 * has chosen its own password, since every login is an admin and reaches
 * the whole admin. A login still on the temporary password an admin gave it
 * (FER-015) is FORBIDDEN until it changes it. The login is re-read from the
 * database and the handler gets the store, the table's one row, as
 * `context.store`: it filters every query by `context.store.id`, and no
 * procedure takes a store from its input. A missing session, or a login
 * removed or disabled, answers UNAUTHORIZED; a session that could not be
 * read is thrown as the failure it was.
 */
export const adminProcedure = signedInProcedure.use(
  async ({ context, next }) => {
    const store = await findAdminStore(context.db, context.session.user.id);

    if (!store) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return await next({ context: { store } });
  }
);
