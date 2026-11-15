import { ORPCError } from "@orpc/server";

import {
  getProductSchema,
  listCategoriesSchema,
  listProductsSchema,
  listRelatedProductsSchema,
} from "@/lib/schemas/catalog";
import { publicProcedure } from "@/server/api/orpc";
import type { DatabaseClient } from "@/server/db";
import {
  getPublishedProduct,
  listCategories,
  listPublishedProducts,
  listRelatedProducts,
} from "@/server/services/catalog";
import { findActiveStoreBySlug } from "@/server/services/store";

/**
 * The active store at the address, or NOT_FOUND: every public read is
 * scoped by the store it resolves, never by an id from the input.
 */
async function activeStore(db: DatabaseClient, slug: string) {
  const found = await findActiveStoreBySlug(db, slug);

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Store not found" });
  }

  return found;
}

/** The storefront's reads (FER-010): published articles only, no session. */
export const catalogRouter = {
  categories: publicProcedure
    .input(listCategoriesSchema)
    .handler(async ({ context, input }) => {
      const store = await activeStore(context.db, input.storeSlug);

      return await listCategories(context.db, {
        locale: input.locale,
        storeId: store.id,
      });
    })
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/categories",
      summary: "List a store's categories in their order",
      tags: ["catalog"],
    }),

  products: publicProcedure
    .input(listProductsSchema)
    .handler(async ({ context, input }) => {
      const { storeSlug, ...filters } = input;
      const store = await activeStore(context.db, storeSlug);

      return await listPublishedProducts(context.db, {
        ...filters,
        currencyCode: store.currencyCode,
        storeId: store.id,
      });
    })
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/products",
      summary: "List a store's published articles, newest first",
      tags: ["catalog"],
    }),

  product: publicProcedure
    .input(getProductSchema)
    .handler(async ({ context, input }) => {
      const store = await activeStore(context.db, input.storeSlug);

      return await getPublishedProduct(context.db, {
        currencyCode: store.currencyCode,
        locale: input.locale,
        slug: input.slug,
        storeId: store.id,
      });
    })
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/products/{slug}",
      summary: "Get a published article by its address",
      tags: ["catalog"],
    }),

  related: publicProcedure
    .input(listRelatedProductsSchema)
    .handler(async ({ context, input }) => {
      const store = await activeStore(context.db, input.storeSlug);
      const article = await getPublishedProduct(context.db, {
        currencyCode: store.currencyCode,
        locale: input.locale,
        slug: input.slug,
        storeId: store.id,
      });

      return await listRelatedProducts(context.db, {
        categoryId: article.categoryId,
        currencyCode: store.currencyCode,
        limit: input.limit,
        locale: input.locale,
        productId: article.id,
        storeId: store.id,
      });
    })
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/products/{slug}/related",
      summary: "List other published articles of the same category",
      tags: ["catalog"],
    }),
};
