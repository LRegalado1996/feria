import {
  createStoreSchema,
  getStoreBySlugSchema,
  updateStoreSchema,
} from "@/lib/schemas/store";
import { publicProcedure, superadminProcedure } from "@/server/api/orpc";
import { invalidateCatalogCache } from "@/server/cache/catalog";
import { invalidateStoreCache } from "@/server/cache/store";
import { withStoreAccess } from "@/server/services/access";
import {
  createStore,
  getActiveStoreBySlug,
  updateStore,
} from "@/server/services/store";

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

  // Opening a store is the platform's call (FER-009). Editing one stays with
  // superadmins too until the settings screen lets members edit their own
  // store through `storeProcedure` (FER-014).
  create: superadminProcedure
    .input(createStoreSchema)
    .handler(async ({ context, input }) => {
      const created = await withStoreAccess(
        context.db,
        { storeId: null, userId: context.session.user.id },
        async (tx) => await createStore(tx, input)
      );
      invalidateStoreCache(created);

      return created;
    })
    .route({
      method: "POST",
      path: "/stores",
      summary: "Create a store",
      tags: ["stores"],
    }),

  update: superadminProcedure
    .input(updateStoreSchema)
    .handler(async ({ context, input }) => {
      const updated = await withStoreAccess(
        context.db,
        { storeId: null, userId: context.session.user.id },
        async (tx) => await updateStore(tx, input)
      );
      invalidateStoreCache(updated);
      // Its articles show its currency.
      invalidateCatalogCache(updated.id);

      return updated;
    })
    .route({
      method: "PUT",
      path: "/stores/{id}",
      summary: "Replace a store's details, colors and texts",
      tags: ["stores"],
    }),
};
