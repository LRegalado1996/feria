import {
  createCategorySchema,
  deleteCategorySchema,
  renameCategorySchema,
  reorderCategoriesSchema,
  updateCategoryPageSchema,
} from "@/lib/schemas/catalog";
import { adminProcedure } from "@/server/api/orpc";
import { writeToCatalog } from "@/server/api/utils/write-to-store";
import {
  createCategory,
  deleteCategory,
  listStoreCategories,
  renameCategory,
  reorderCategories,
  updateCategoryPage,
} from "@/server/services/category";

/**
 * The store's categories (FER-016), for the admin: every query is on the
 * store `adminProcedure` puts in the context, and every write re-checks the
 * caller's login inside its transaction. Every write drops the cached
 * catalog: each store page's header and footer list the categories in their
 * order (FER-039), an article's static page included.
 */
export const categoryRouter = {
  list: adminProcedure
    .handler(
      async ({ context }) =>
        await listStoreCategories(context.db, { storeId: context.store.id })
    )
    .route({
      method: "GET",
      path: "/admin/categories",
      summary: "List a store's categories with their article counts",
      tags: ["categories"],
    }),

  create: adminProcedure
    .input(createCategorySchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
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
      path: "/admin/categories",
      summary: "Add a category at the end of the list",
      tags: ["categories"],
    }),

  rename: adminProcedure
    .input(renameCategorySchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
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
      path: "/admin/categories/{id}",
      summary: "Rename a category in both languages",
      tags: ["categories"],
    }),

  updatePage: adminProcedure
    .input(updateCategoryPageSchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
          context,
          async (tx, storeId) =>
            await updateCategoryPage(tx, { storeId, values: input })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/categories/{id}/page",
      summary:
        "Set a category's group, its texts for search engines and its cover's description",
      tags: ["categories"],
    }),

  reorder: adminProcedure
    .input(reorderCategoriesSchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
          context,
          async (tx, storeId) =>
            await reorderCategories(tx, { ids: input.ids, storeId })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/categories/order",
      summary: "Put a store's categories in a new order",
      tags: ["categories"],
    }),

  delete: adminProcedure
    .input(deleteCategorySchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
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
      path: "/admin/categories/{id}",
      summary: "Delete a category, moving its articles to another one",
      tags: ["categories"],
    }),
};
