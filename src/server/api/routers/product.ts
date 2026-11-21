import {
  createProductSchema,
  listStoreProductsSchema,
  productIdSchema,
  setProductAvailabilitySchema,
  updateProductSchema,
} from "@/lib/schemas/catalog";
import { adminProcedure } from "@/server/api/orpc";
import { discardBlobs, readBlobStore } from "@/server/api/utils/blob-store";
import {
  writeToCatalog,
  writeToStore,
} from "@/server/api/utils/write-to-store";
import {
  createProduct,
  deleteProduct,
  getStoreProduct,
  listStoreProducts,
  publishProduct,
  setProductAvailability,
  unpublishProduct,
  updateProduct,
} from "@/server/services/product";

/**
 * The store's articles (FER-010, FER-017), for the admin: every procedure
 * runs its write with the caller's login re-checked inside the transaction,
 * and every query filters by the store `adminProcedure` puts in the context.
 */
export const productRouter = {
  list: adminProcedure
    .input(listStoreProductsSchema)
    .handler(
      async ({ context, input }) =>
        await listStoreProducts(context.db, {
          ...input,
          storeId: context.store.id,
        })
    )
    .route({
      method: "GET",
      path: "/admin/products",
      summary:
        "A numbered page of the store's articles, drafts too: searched, filtered and sorted",
      tags: ["products"],
    }),

  get: adminProcedure
    .input(productIdSchema)
    .handler(
      async ({ context, input }) =>
        await getStoreProduct(context.db, {
          id: input.id,
          storeId: context.store.id,
        })
    )
    .route({
      method: "GET",
      path: "/admin/products/{id}",
      summary: "One article, draft or published, with everything it holds",
      tags: ["products"],
    }),

  create: adminProcedure
    .input(createProductSchema)
    .handler(
      async ({ context, input: values }) =>
        // A new article is a draft: no shopper's page shows it yet.
        await writeToStore(
          context,
          async (tx, storeId) =>
            await createProduct(tx, {
              blobStore: readBlobStore(),
              storeId,
              values,
            })
        )
    )
    .route({
      method: "POST",
      path: "/admin/products",
      summary: "Create a draft article with its texts, photos and filters",
      tags: ["products"],
    }),

  update: adminProcedure
    .input(updateProductSchema)
    .handler(async ({ context, input: values }) => {
      const { discardedImageUrls, ...saved } = await writeToCatalog(
        context,
        async (tx, storeId) =>
          await updateProduct(tx, {
            blobStore: readBlobStore(),
            storeId,
            values,
          }),
        // A draft's autosave changes nothing a shopper sees.
        (result) => result.status === "published"
      );
      // The photos it no longer shows go once it is saved (FER-011).
      discardBlobs(context.db, discardedImageUrls);

      return saved;
    })
    .route({
      method: "PUT",
      path: "/admin/products/{id}",
      summary: "Save a whole article: fields, texts, photos and filters",
      tags: ["products"],
    }),

  publish: adminProcedure
    .input(productIdSchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
          context,
          async (tx, storeId) =>
            await publishProduct(tx, {
              id: input.id,
              storeId,
            })
        )
    )
    .route({
      method: "POST",
      path: "/admin/products/{id}/publish",
      summary: "Publish an article that has everything it needs",
      tags: ["products"],
    }),

  unpublish: adminProcedure
    .input(productIdSchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
          context,
          async (tx, storeId) =>
            await unpublishProduct(tx, {
              id: input.id,
              storeId,
            })
        )
    )
    .route({
      method: "POST",
      path: "/admin/products/{id}/unpublish",
      summary: "Take an article back to draft",
      tags: ["products"],
    }),

  setAvailability: adminProcedure
    .input(setProductAvailabilitySchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
          context,
          async (tx, storeId) =>
            await setProductAvailability(tx, {
              id: input.id,
              isAvailable: input.isAvailable,
              storeId,
            })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/products/{id}/availability",
      summary: "Mark an article available or not",
      tags: ["products"],
    }),

  delete: adminProcedure
    .input(productIdSchema)
    .handler(async ({ context, input }) => {
      const { id, imageUrls } = await writeToCatalog(
        context,
        async (tx, storeId) =>
          await deleteProduct(tx, { id: input.id, storeId })
      );
      // Its photos' files go once the rows are gone for good (FER-011).
      discardBlobs(context.db, imageUrls);

      return { id };
    })
    .route({
      method: "DELETE",
      path: "/admin/products/{id}",
      summary: "Delete an article",
      tags: ["products"],
    }),
};
