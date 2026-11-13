import { OpenAPIHandler } from "@orpc/openapi/fetch";
import type { NextRequest } from "next/server";

import { withEvlog } from "@/lib/evlog";
import { interceptErrors } from "@/server/api/interceptor";
import { healthRouter } from "@/server/api/routers/health";
import { db } from "@/server/db";

// Only `healthRouter`: no app procedure is reachable under /api/health.
const handler = new OpenAPIHandler(healthRouter, {
  clientInterceptors: [interceptErrors],
});

async function probe(request: NextRequest) {
  const { response } = await handler.handle(request, {
    prefix: "/api/health",
    // No session lookup: the probe must report the database, not need it to
    // build its context.
    context: { db, headers: request.headers, session: null },
  });

  const result = response ?? new Response("Not found", { status: 404 });
  // A cached answer would report a database that is no longer there.
  result.headers.set("Cache-Control", "no-store");
  return result;
}

/**
 * `GET` only. Next answers other methods with 405 and maps `HEAD` to this
 * export, where it matches no procedure, so only a real GET runs the probe.
 */
export const GET = withEvlog(probe);
