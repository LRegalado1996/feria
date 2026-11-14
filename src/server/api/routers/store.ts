import { ORPCError } from "@orpc/server";

import { detectStableEnvironment, isProductionDeploy } from "@/lib/env/deploy";
import {
  createStoreSchema,
  getStoreBySlugSchema,
  updateStoreSchema,
} from "@/lib/schemas/store";
import { protectedProcedure, publicProcedure } from "@/server/api/orpc";
import { invalidateStoreCache } from "@/server/cache/store";
import {
  createStore,
  getActiveStoreBySlug,
  updateStore,
} from "@/server/services/store";

/**
 * Writing a store, for now: any signed-in user, and never on production.
 * There is no role to check until FER-009 brings `superadminProcedure` and
 * `storeProcedure`, and sign-up is still public, so the live site refuses
 * these procedures outright instead of trusting that they are not deployed
 * there. Production is the Vercel production deployment or the `main` branch,
 * as for the `/design` gallery. FER-009 replaces this builder and its gate.
 */
const storeWriteProcedure = protectedProcedure.use(({ next }) => {
  if (
    isProductionDeploy() ||
    detectStableEnvironment(process.env) === "production"
  ) {
    throw new ORPCError("FORBIDDEN", {
      message: "Stores cannot be changed here yet",
    });
  }

  return next();
});

export const storeRouter = {
  getBySlug: publicProcedure
    .input(getStoreBySlugSchema)
    .handler(
      async ({ context, input }) =>
        await getActiveStoreBySlug(context.db, input)
    )
    .route({
      method: "GET",
      path: "/stores/{slug}",
      summary: "Get an active store by its address",
      tags: ["stores"],
    }),

  create: storeWriteProcedure
    .input(createStoreSchema)
    .handler(async ({ context, input }) => {
      const created = await createStore(context.db, input);
      invalidateStoreCache(created);

      return created;
    })
    .route({
      method: "POST",
      path: "/stores",
      summary: "Create a store",
      tags: ["stores"],
    }),

  update: storeWriteProcedure
    .input(updateStoreSchema)
    .handler(async ({ context, input }) => {
      const updated = await updateStore(context.db, input);
      invalidateStoreCache(updated);

      return updated;
    })
    .route({
      method: "PUT",
      path: "/stores/{id}",
      summary: "Replace a store's details, colors and texts",
      tags: ["stores"],
    }),
};
