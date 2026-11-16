import {
  getProductSchema,
  listCategoriesSchema,
  listProductsSchema,
  listRelatedProductsSchema,
} from "@/lib/schemas/catalog";
import { publicProcedure } from "@/server/api/orpc";
import {
  getPublishedProduct,
  getPublishedProductRef,
  listCategories,
  listPublishedProducts,
  listRelatedProducts,
} from "@/server/services/catalog";
import { getActiveStoreBySlug } from "@/server/services/store";

/** The storefront's reads (FER-010): published articles only, no session. */
export const catalogRouter = {
  categories: publicProcedure
    .input(listCategoriesSchema)
    .handler(async ({ context, input }) => {
      const store = await getActiveStoreBySlug(context.db, {
        slug: input.storeSlug,
      });

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
      const store = await getActiveStoreBySlug(context.db, {
        slug: storeSlug,
      });

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
      const store = await getActiveStoreBySlug(context.db, {
        slug: input.storeSlug,
      });

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
      const store = await getActiveStoreBySlug(context.db, {
        slug: input.storeSlug,
      });
      const article = await getPublishedProductRef(context.db, {
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
