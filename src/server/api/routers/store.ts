import { updateStoreSchema } from "@/lib/schemas/store";
import { adminProcedure, publicProcedure } from "@/server/api/orpc";
import { writeToStore } from "@/server/api/utils/write-to-store";
import { invalidateCatalogCache } from "@/server/cache/catalog";
import { invalidateStoreCache } from "@/server/cache/store";
import { getStore, updateStore } from "@/server/services/store";

/**
 * The company the site sells for (FER-038): the store table's one row. There
 * is nothing to create, so there is no procedure that creates one; any admin
 * edits it from the settings screen (FER-014), all but its currency, which
 * is fixed per store.
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
      // The page of all articles caches its cover's description out of the
      // store's texts (`readAllArticlesCover`), falling back to the other
      // language's: an edit that adds or removes a language's text changes it.
      invalidateCatalogCache(updated.id);

      return updated;
    })
    .route({
      method: "PUT",
      path: "/store",
      summary: "Replace the store's details and texts (never its currency)",
      tags: ["store"],
    }),
};
