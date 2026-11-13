import "server-only";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { headers } from "next/headers";
import { cache } from "react";

import { createQueryClient } from "@/lib/orpc/query-client";
import { createORPCContext } from "@/server/api/orpc";
import { appRouter } from "@/server/api/root";

const createContext = cache(
  async () => await createORPCContext({ headers: await headers() })
);

export const getQueryClient = cache(createQueryClient);

export const caller = createRouterClient(appRouter, {
  context: createContext,
});

export const orpc = createTanstackQueryUtils(caller);
