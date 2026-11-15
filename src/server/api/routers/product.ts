import {
  createProductSchema,
  productIdSchema,
  reorderProductImagesSchema,
  setProductAvailabilitySchema,
  updateProductSchema,
} from "@/lib/schemas/catalog";
import { storeProcedure } from "@/server/api/orpc";
import { withStoreAccess } from "@/server/services/access";
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
 * A store's own articles (FER-010): every procedure resolves the store from
 * `storeSlug` against the caller and runs its write with the caller's access
 * re-checked inside the transaction. Every query filters by that store.
 */
export const productRouter = {
  create: storeProcedure(createProductSchema)
    .handler(
      async ({ context, input: { storeSlug: _storeSlug, ...values } }) =>
        await withStoreAccess(
          context.db,
          { storeId: context.store.id, userId: context.session.user.id },
          async (tx) =>
            await createProduct(tx, { storeId: context.store.id, values })
        )
    )
    .route({
      method: "POST",
      path: "/stores/{storeSlug}/admin/products",
      summary: "Create a draft article",
      tags: ["products"],
    }),

  update: storeProcedure(updateProductSchema)
    .handler(
      async ({ context, input: { storeSlug: _storeSlug, ...values } }) =>
        await withStoreAccess(
          context.db,
          { storeId: context.store.id, userId: context.session.user.id },
          async (tx) =>
            await updateProduct(tx, { storeId: context.store.id, values })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/products/{id}",
      summary: "Replace an article's fields and texts",
      tags: ["products"],
    }),

  publish: storeProcedure(productIdSchema)
    .handler(
      async ({ context, input }) =>
        await withStoreAccess(
          context.db,
          { storeId: context.store.id, userId: context.session.user.id },
          async (tx) =>
            await publishProduct(tx, {
              id: input.id,
              storeId: context.store.id,
            })
        )
    )
    .route({
      method: "POST",
      path: "/stores/{storeSlug}/admin/products/{id}/publish",
      summary: "Publish an article that has everything it needs",
      tags: ["products"],
    }),

  unpublish: storeProcedure(productIdSchema)
    .handler(
      async ({ context, input }) =>
        await withStoreAccess(
          context.db,
          { storeId: context.store.id, userId: context.session.user.id },
          async (tx) =>
            await unpublishProduct(tx, {
              id: input.id,
              storeId: context.store.id,
            })
        )
    )
    .route({
      method: "POST",
      path: "/stores/{storeSlug}/admin/products/{id}/unpublish",
      summary: "Take an article back to draft",
      tags: ["products"],
    }),

  setAvailability: storeProcedure(setProductAvailabilitySchema)
    .handler(
      async ({ context, input }) =>
        await withStoreAccess(
          context.db,
          { storeId: context.store.id, userId: context.session.user.id },
          async (tx) =>
            await setProductAvailability(tx, {
              id: input.id,
              isAvailable: input.isAvailable,
              storeId: context.store.id,
            })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/products/{id}/availability",
      summary: "Mark an article available or not",
      tags: ["products"],
    }),

  delete: storeProcedure(productIdSchema)
    .handler(
      async ({ context, input }) =>
        await withStoreAccess(
          context.db,
          { storeId: context.store.id, userId: context.session.user.id },
          async (tx) =>
            await deleteProduct(tx, { id: input.id, storeId: context.store.id })
        )
    )
    .route({
      method: "DELETE",
      path: "/stores/{storeSlug}/admin/products/{id}",
      summary: "Delete an article",
      tags: ["products"],
    }),

  reorderImages: storeProcedure(reorderProductImagesSchema)
    .handler(
      async ({ context, input }) =>
        await withStoreAccess(
          context.db,
          { storeId: context.store.id, userId: context.session.user.id },
          async (tx) =>
            await reorderProductImages(tx, {
              id: input.id,
              imageIds: input.imageIds,
              storeId: context.store.id,
            })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/products/{id}/images/order",
      summary: "Put an article's images in a new order",
      tags: ["products"],
    }),
};
