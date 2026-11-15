import { ORPCError, os } from "@orpc/server";
import { z } from "zod";

import { appErrorDataSchema } from "@/lib/errors";
import type { StoreScopeValues } from "@/lib/schemas/access";
import { safeRequestLogger } from "@/server/api/utils/logger";
import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import { findAccessibleStore, getUserRole } from "@/server/services/access";

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

/**
 * A superadmin only (FER-009): every store, every user, the metrics. The role
 * is re-read from the database on every call; the session's copy can be
 * minutes old. Anyone else gets FORBIDDEN: the platform procedures are no
 * secret, so refusing them confirms nothing.
 */
export const superadminProcedure = protectedProcedure.use(
  async ({ context, next }) => {
    const role = await getUserRole(context.db, context.session.user.id);

    if (role !== "superadmin") {
      throw new ORPCError("FORBIDDEN");
    }

    return await next();
  }
);

/**
 * Resolves the store a store-scoped procedure works on, from the slug in its
 * input, against the caller's access. Attached with `storeProcedure(schema)`.
 */
const storeAccess = o.middleware(
  async ({ context, next }, storeSlug: string) => {
    const userId = context.session?.user.id;

    if (!userId) {
      throw new ORPCError("UNAUTHORIZED");
    }

    const store = await findAccessibleStore(context.db, {
      slug: storeSlug,
      userId,
    });

    if (!store) {
      throw new ORPCError("NOT_FOUND", { message: "Store not found" });
    }

    return await next({ context: { store } });
  }
);

/**
 * A procedure on one store (FER-009). Its input names the store by
 * `storeSlug` (extend `storeScopeSchema`); before the handler runs, the slug
 * is resolved against the caller: a superadmin reaches every store, a member
 * only theirs. A store the caller may not work on answers NOT_FOUND, exactly
 * like one that does not exist, so a member of store A learns nothing about
 * store B. The handler gets the trusted row as `context.store` and filters
 * every query by `context.store.id`, never by an id from the input.
 */
export function storeProcedure<TSchema extends StoreScopedSchema>(
  schema: TSchema
) {
  return protectedProcedure
    .input(schema)
    .use(storeAccess, (input) => input.storeSlug);
}

/** Any zod schema whose output names a store, as `storeScopeSchema` does. */
type StoreScopedSchema = z.ZodType<StoreScopeValues>;
