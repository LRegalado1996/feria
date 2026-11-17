import { updateStoreSchema } from "@/lib/schemas/store";
import { adminProcedure, publicProcedure } from "@/server/api/orpc";
import { writeToStore } from "@/server/api/utils/write-to-store";
import { invalidateCatalogCache } from "@/server/cache/catalog";
import { invalidateStoreCache } from "@/server/cache/store";
import { getStore, updateStore } from "@/server/services/store";

/**
 * The company the site sells for (FER-038): the store table's one row. There
 * is nothing to create, so there is no procedure that creates one; any admin
 * edits it (the settings screen is FER-014).
 */
export const storeRouter = {
  get: publicProcedure
    .handler(async ({ context }) => await getStore(context.db))
    .route({
      method: "GET",
      path: "/store",
      summary: "The store: its name, contacts, currency and texts",
      tags: ["store"],
    }),

  update: adminProcedure
    .input(updateStoreSchema)
    .handler(async ({ context, input }) => {
      const updated = await writeToStore(
        context,
        async (tx) => await updateStore(tx, input)
      );
      invalidateStoreCache();
      // Its articles show its currency.
      invalidateCatalogCache(updated.id);

      return updated;
    })
    .route({
      method: "PUT",
      path: "/store",
      summary: "Replace the store's details and texts",
      tags: ["store"],
    }),
};
