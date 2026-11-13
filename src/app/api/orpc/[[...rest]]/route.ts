import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import { ResponseHeadersPlugin } from "@orpc/server/plugins";
import type { NextRequest } from "next/server";

import { withEvlog } from "@/lib/evlog";
import {
  createObservedContext,
  interceptErrors,
} from "@/server/api/interceptor";
import { appRouter } from "@/server/api/root";

const handler = new RPCHandler(appRouter, {
  plugins: [
    // Under Vercel's 4.5 MB request cap, so an oversized body is a typed 413
    // instead of the platform's own error page.
    new BodyLimitPlugin({ maxBodySize: 4_250_000 }),
    // Merges `context.resHeaders` (Better Auth's refreshed cookies) into the
    // response, error responses included.
    new ResponseHeadersPlugin(),
  ],
  clientInterceptors: [interceptErrors],
});

/**
 * A plain `Request` rebuilt from the incoming one. Next's production
 * instrumentation can hand the route a proxied `NextRequest`, which undici
 * cannot clone, and the body limiter clones its input. `duplex: "half"` is
 * what a streamed body requires.
 */
function createNativeRequest(request: NextRequest): Request {
  const init: RequestInit & { duplex?: "half" } = {
    headers: request.headers,
    method: request.method,
    signal: request.signal,
  };
  if (request.body) {
    init.body = request.body;
    init.duplex = "half";
  }
  return new Request(request.url, init);
}

async function handleRequest(request: NextRequest) {
  const context = await createObservedContext({
    headers: request.headers,
    resHeaders: new Headers(),
    signal: request.signal,
  });

  const { response } = await handler.handle(createNativeRequest(request), {
    prefix: "/api/orpc",
    context,
  });

  return response ?? new Response("Not found", { status: 404 });
}

// One wide event per request (src/lib/evlog.ts).
const handleLoggedRequest = withEvlog(handleRequest);

export { handleLoggedRequest as GET, handleLoggedRequest as POST };
