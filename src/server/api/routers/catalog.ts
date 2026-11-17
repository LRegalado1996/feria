import { listCartProductsSchema } from "@/lib/schemas/cart";
import {
  getProductSchema,
  listCatalogFiltersSchema,
  listCategoriesSchema,
  listProductsSchema,
  listRelatedProductsSchema,
} from "@/lib/schemas/catalog";
import { publicProcedure } from "@/server/api/orpc";
import {
  listCatalogFilters,
  resolveCatalogFilters,
} from "@/server/services/attribute";
import {
  getPublishedProduct,
  getPublishedProductRef,
  listCartProducts,
  listCategories,
  listPublishedProducts,
  listRelatedProducts,
} from "@/server/services/catalog";
import { getStore } from "@/server/services/store";

/** The storefront's reads (FER-010): published articles only, no session. */
export const catalogRouter = {
  cartProducts: publicProcedure
    .input(listCartProductsSchema)
    .handler(async ({ context, input }) => {
      const store = await getStore(context.db);

      return await listCartProducts(context.db, {
        currencyCode: store.currencyCode,
        ids: input.ids,
        locale: input.locale,
        storeId: store.id,
      });
    })
    .route({
      method: "GET",
      path: "/cart-products",
      summary: "The cart's articles with their current price and stock",
      tags: ["catalog"],
    }),

  categories: publicProcedure
    .input(listCategoriesSchema)
    .handler(async ({ context, input }) => {
      const store = await getStore(context.db);

      return await listCategories(context.db, {
        locale: input.locale,
        storeId: store.id,
      });
    })
    .route({
      method: "GET",
      path: "/categories",
      summary: "List a store's categories in their order",
      tags: ["catalog"],
    }),

  filters: publicProcedure
    .input(listCatalogFiltersSchema)
    .handler(async ({ context, input }) => {
      const store = await getStore(context.db);

      return await listCatalogFilters(context.db, {
        locale: input.locale,
        storeId: store.id,
      });
    })
    .route({
      method: "GET",
      path: "/filters",
      summary: "List a store's filters with the values its articles carry",
      tags: ["catalog"],
    }),

  products: publicProcedure
    .input(listProductsSchema)
    .handler(async ({ context, input }) => {
      const { filters = [], ...query } = input;
      const store = await getStore(context.db);
      const valueGroups = await resolveCatalogFilters(context.db, {
        filters,
        storeId: store.id,
      });

      return await listPublishedProducts(context.db, {
        ...query,
        currencyCode: store.currencyCode,
        storeId: store.id,
        valueGroups,
      });
    })
    .route({
      method: "GET",
      path: "/products",
      summary:
        "List a store's published articles in its own order, newest first or by price",
      tags: ["catalog"],
    }),

  product: publicProcedure
    .input(getProductSchema)
    .handler(async ({ context, input }) => {
      const store = await getStore(context.db);

      return await getPublishedProduct(context.db, {
        currencyCode: store.currencyCode,
        locale: input.locale,
        slug: input.slug,
        storeId: store.id,
      });
    })
    .route({
      method: "GET",
      path: "/products/{slug}",
      summary: "Get a published article by its address",
      tags: ["catalog"],
    }),

  related: publicProcedure
    .input(listRelatedProductsSchema)
    .handler(async ({ context, input }) => {
      const store = await getStore(context.db);
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
      path: "/products/{slug}/related",
      summary: "List other published articles of the same category",
      tags: ["catalog"],
    }),
};
