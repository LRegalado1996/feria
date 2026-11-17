import {
  createProductSchema,
  productIdSchema,
  reorderProductImagesSchema,
  setProductAttributeValuesSchema,
  setProductAvailabilitySchema,
  updateProductSchema,
} from "@/lib/schemas/catalog";
import { adminProcedure } from "@/server/api/orpc";
import { discardBlobs } from "@/server/api/utils/blob-store";
import {
  writeToCatalog,
  writeToStore,
} from "@/server/api/utils/write-to-store";
import { setProductAttributeValues } from "@/server/services/attribute";
import {
  createProduct,
  deleteProduct,
  publishProduct,
  reorderProductImages,
  setProductAvailability,
  unpublishProduct,
  updateProduct,
} from "@/server/services/catalog";

/**
 * The store's articles (FER-010), for the admin: every procedure runs its
 * write with the caller's login re-checked inside the transaction, and every
 * query filters by the store `adminProcedure` puts in the context.
 */
export const productRouter = {
  create: adminProcedure
    .input(createProductSchema)
    .handler(
      async ({ context, input: values }) =>
        await writeToStore(
          context,
          async (tx, storeId) => await createProduct(tx, { storeId, values })
        )
    )
    .route({
      method: "POST",
      path: "/admin/products",
      summary: "Create a draft article",
      tags: ["products"],
    }),

  update: adminProcedure
    .input(updateProductSchema)
    .handler(
      async ({ context, input: values }) =>
        await writeToCatalog(
          context,
          async (tx, storeId) => await updateProduct(tx, { storeId, values })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/products/{id}",
      summary: "Replace an article's fields and texts",
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

  reorderImages: adminProcedure
    .input(reorderProductImagesSchema)
    .handler(
      async ({ context, input }) =>
        await writeToCatalog(
          context,
          async (tx, storeId) =>
            await reorderProductImages(tx, {
              id: input.id,
              imageIds: input.imageIds,
              storeId,
            })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/products/{id}/images/order",
      summary: "Put an article's images in a new order",
      tags: ["products"],
    }),

  setAttributeValues: adminProcedure
    .input(setProductAttributeValuesSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await setProductAttributeValues(tx, {
              productId: input.id,
              storeId,
              valueIds: input.valueIds,
            })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/products/{id}/filter-values",
      summary: "Replace the filter values an article carries",
      tags: ["products"],
    }),
};
