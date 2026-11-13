import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import type { NextRequest } from "next/server";

import { getBaseUrl } from "@/lib/orpc/get-base-url";
import {
  createObservedContext,
  interceptErrors,
} from "@/server/api/interceptor";
import { appRouter } from "@/server/api/root";
import { auth } from "@/server/better-auth";

const createContext = async (req: NextRequest) =>
  await createObservedContext({
    headers: req.headers,
  });

const handler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: () => ({
        info: {
          title: "API",
          version: "1.0.0",
        },
        servers: [{ url: `${getBaseUrl()}/api/docs` }],
      }),
    }),
  ],
  // It executes the same procedures, so it classifies failures the same way.
  clientInterceptors: [interceptErrors],
});

async function handleRequest(request: NextRequest) {
  // Decides access, so it reads past the session cookie cache.
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });

  if (!session) {
    return Response.redirect(new URL("/", request.url));
  }

  const { response } = await handler.handle(request, {
    prefix: "/api/docs",
    context: await createContext(request),
  });

  return response ?? new Response("Not found", { status: 404 });
}

export {
  handleRequest as DELETE,
  handleRequest as GET,
  handleRequest as HEAD,
  handleRequest as PATCH,
  handleRequest as POST,
  handleRequest as PUT,
};
