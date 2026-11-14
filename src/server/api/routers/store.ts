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

  // Any signed-in user, until FER-009 brings roles and this becomes its
  // `superadminProcedure`.
  create: protectedProcedure
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

  // Any signed-in user and any store, until FER-009 brings roles and this
  // becomes its `storeProcedure` (a superadmin or a member of this store).
  update: protectedProcedure
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
