import {
  createProductSchema,
  productIdSchema,
  reorderProductImagesSchema,
  setProductAvailabilitySchema,
  updateProductSchema,
} from "@/lib/schemas/catalog";
import { storeProcedure } from "@/server/api/orpc";
import type { DatabaseClient } from "@/server/db";
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

/** What a store-scoped handler knows: the resolved store and the caller. */
interface StoreWriteContext {
  db: DatabaseClient;
  session: { user: { id: string } };
  store: { id: number };
}

/**
 * Runs a write on the resolved store with the caller's access re-checked
 * inside its transaction: the one place every procedure below goes through,
 * so none can forget the re-check or pass another store's id.
 */
async function writeToStore<T>(
  context: StoreWriteContext,
  write: (tx: DatabaseClient, storeId: number) => Promise<T>
): Promise<T> {
  return await withStoreAccess(
    context.db,
    { storeId: context.store.id, userId: context.session.user.id },
    async (tx) => await write(tx, context.store.id)
  );
}

/**
 * A store's own articles (FER-010): every procedure resolves the store from
 * `storeSlug` against the caller and runs its write with the caller's access
 * re-checked inside the transaction. Every query filters by that store.
 */
export const productRouter = {
  create: storeProcedure(createProductSchema)
    .handler(
      async ({ context, input: { storeSlug: _storeSlug, ...values } }) =>
        await writeToStore(
          context,
          async (tx, storeId) => await createProduct(tx, { storeId, values })
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
        await writeToStore(
          context,
          async (tx, storeId) => await updateProduct(tx, { storeId, values })
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
        await writeToStore(
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
      path: "/stores/{storeSlug}/admin/products/{id}/publish",
      summary: "Publish an article that has everything it needs",
      tags: ["products"],
    }),

  unpublish: storeProcedure(productIdSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
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
      path: "/stores/{storeSlug}/admin/products/{id}/unpublish",
      summary: "Take an article back to draft",
      tags: ["products"],
    }),

  setAvailability: storeProcedure(setProductAvailabilitySchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
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
      path: "/stores/{storeSlug}/admin/products/{id}/availability",
      summary: "Mark an article available or not",
      tags: ["products"],
    }),

  delete: storeProcedure(productIdSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await deleteProduct(tx, { id: input.id, storeId })
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
        await writeToStore(
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
      path: "/stores/{storeSlug}/admin/products/{id}/images/order",
      summary: "Put an article's images in a new order",
      tags: ["products"],
    }),
};
