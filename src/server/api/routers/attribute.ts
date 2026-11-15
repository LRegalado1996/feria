import {
  createAttributeSchema,
  createAttributeValueSchema,
  deleteAttributeSchema,
  deleteAttributeValueSchema,
  listStoreAttributesSchema,
  renameAttributeSchema,
  reorderAttributesSchema,
  reorderAttributeValuesSchema,
  updateAttributeValueSchema,
} from "@/lib/schemas/catalog";
import { storeProcedure } from "@/server/api/orpc";
import { writeToStore } from "@/server/api/utils/write-to-store";
import {
  createAttribute,
  createAttributeValue,
  deleteAttribute,
  deleteAttributeValue,
  listStoreAttributes,
  renameAttribute,
  reorderAttributes,
  reorderAttributeValues,
  updateAttributeValue,
} from "@/server/services/attribute";

/**
 * A store's own filters and their values (FER-033): the store comes from
 * `storeSlug` resolved against the caller, and every write re-checks that
 * access inside its transaction.
 */
export const attributeRouter = {
  list: storeProcedure(listStoreAttributesSchema)
    .handler(
      async ({ context }) =>
        await listStoreAttributes(context.db, { storeId: context.store.id })
    )
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/admin/filters",
      summary: "List a store's filters with their values and article counts",
      tags: ["filters"],
    }),

  create: storeProcedure(createAttributeSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await createAttribute(tx, {
              storeId,
              values: { nameEn: input.nameEn, nameEs: input.nameEs },
            })
        )
    )
    .route({
      method: "POST",
      path: "/stores/{storeSlug}/admin/filters",
      summary: "Add a filter",
      tags: ["filters"],
    }),

  rename: storeProcedure(renameAttributeSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await renameAttribute(tx, {
              id: input.id,
              storeId,
              values: { nameEn: input.nameEn, nameEs: input.nameEs },
            })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/filters/{id}",
      summary: "Rename a filter",
      tags: ["filters"],
    }),

  reorder: storeProcedure(reorderAttributesSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await reorderAttributes(tx, { ids: input.ids, storeId })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/filters/order",
      summary: "Put a store's filters in a new order",
      tags: ["filters"],
    }),

  delete: storeProcedure(deleteAttributeSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await deleteAttribute(tx, { id: input.id, storeId })
        )
    )
    .route({
      method: "DELETE",
      path: "/stores/{storeSlug}/admin/filters/{id}",
      summary: "Delete a filter and its values",
      tags: ["filters"],
    }),

  createValue: storeProcedure(createAttributeValueSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await createAttributeValue(tx, {
              attributeId: input.attributeId,
              storeId,
              swatchColor: input.swatchColor,
              values: { nameEn: input.nameEn, nameEs: input.nameEs },
            })
        )
    )
    .route({
      method: "POST",
      path: "/stores/{storeSlug}/admin/filter-values",
      summary: "Add a value to a filter",
      tags: ["filters"],
    }),

  updateValue: storeProcedure(updateAttributeValueSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await updateAttributeValue(tx, {
              id: input.id,
              storeId,
              swatchColor: input.swatchColor,
              values: { nameEn: input.nameEn, nameEs: input.nameEs },
            })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/filter-values/{id}",
      summary: "Rename a filter value or change its swatch",
      tags: ["filters"],
    }),

  reorderValues: storeProcedure(reorderAttributeValuesSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await reorderAttributeValues(tx, {
              attributeId: input.attributeId,
              ids: input.ids,
              storeId,
            })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/filter-values/order",
      summary: "Put a filter's values in a new order",
      tags: ["filters"],
    }),

  deleteValue: storeProcedure(deleteAttributeValueSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await deleteAttributeValue(tx, { id: input.id, storeId })
        )
    )
    .route({
      method: "DELETE",
      path: "/stores/{storeSlug}/admin/filter-values/{id}",
      summary: "Delete a filter value, taking it off its articles",
      tags: ["filters"],
    }),
};
