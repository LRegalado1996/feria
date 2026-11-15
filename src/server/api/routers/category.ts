import {
  createCategorySchema,
  deleteCategorySchema,
  listStoreCategoriesSchema,
  renameCategorySchema,
  reorderCategoriesSchema,
} from "@/lib/schemas/catalog";
import { storeProcedure } from "@/server/api/orpc";
import { writeToStore } from "@/server/api/utils/write-to-store";
import {
  createCategory,
  deleteCategory,
  listStoreCategories,
  renameCategory,
  reorderCategories,
} from "@/server/services/category";

/**
 * A store's own categories (FER-016): the store comes from `storeSlug`
 * resolved against the caller, and every write re-checks that access inside
 * its transaction.
 */
export const categoryRouter = {
  list: storeProcedure(listStoreCategoriesSchema)
    .handler(
      async ({ context }) =>
        await listStoreCategories(context.db, { storeId: context.store.id })
    )
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/admin/categories",
      summary: "List a store's categories with their article counts",
      tags: ["categories"],
    }),

  create: storeProcedure(createCategorySchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await createCategory(tx, {
              storeId,
              values: { nameEn: input.nameEn, nameEs: input.nameEs },
            })
        )
    )
    .route({
      method: "POST",
      path: "/stores/{storeSlug}/admin/categories",
      summary: "Add a category at the end of the list",
      tags: ["categories"],
    }),

  rename: storeProcedure(renameCategorySchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await renameCategory(tx, {
              id: input.id,
              storeId,
              values: { nameEn: input.nameEn, nameEs: input.nameEs },
            })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/categories/{id}",
      summary: "Rename a category in both languages",
      tags: ["categories"],
    }),

  reorder: storeProcedure(reorderCategoriesSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await reorderCategories(tx, { ids: input.ids, storeId })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/categories/order",
      summary: "Put a store's categories in a new order",
      tags: ["categories"],
    }),

  delete: storeProcedure(deleteCategorySchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await deleteCategory(tx, {
              id: input.id,
              moveToId: input.moveToId,
              storeId,
            })
        )
    )
    .route({
      method: "DELETE",
      path: "/stores/{storeSlug}/admin/categories/{id}",
      summary: "Delete a category, moving its articles to another one",
      tags: ["categories"],
    }),
};
