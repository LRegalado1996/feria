import { createHash, timingSafeEqual } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { env } from "@/env";
import { publicProcedure } from "@/server/api/orpc";
import { pingDatabase } from "@/server/services/health";

const BEARER_PREFIX = /^Bearer /;

/**
 * Open when `HEALTH_SECRET` is unset; otherwise the caller presents it as a
 * bearer token or, for a monitor that cannot set headers, as `?secret=`.
 * Compared in constant time over digests, so neither the content nor the
 * length of the secret leaks through timing.
 */
function presentsHealthSecret(headers: Headers, querySecret?: string): boolean {
  const expected = env.HEALTH_SECRET;
  if (!expected) {
    return true;
  }
  const presented =
    querySecret ??
    headers.get("authorization")?.replace(BEARER_PREFIX, "") ??
    "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(presented), digest(expected));
}

/**
 * Served only by `/api/health` and kept out of `appRouter`, so no other
 * handler publishes it.
 */
export const healthRouter = {
  status: publicProcedure
    .route({
      method: "GET",
      path: "/",
      summary: "Whether the app can reach its database",
      tags: ["health"],
    })
    .input(z.object({ secret: z.string().optional() }))
    .handler(async ({ context, input }) => {
      if (!presentsHealthSecret(context.headers, input.secret)) {
        throw new ORPCError("UNAUTHORIZED");
      }
      try {
        await pingDatabase(context.db);
      } catch (error) {
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "The database is unreachable.",
          cause: error,
        });
      }
      return { db: "ok" as const };
    }),
};
