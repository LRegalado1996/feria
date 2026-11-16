import {
  createAttributeSchema,
  createAttributeValueSchema,
  deleteAttributeSchema,
  deleteAttributeValueSchema,
  renameAttributeSchema,
  reorderAttributesSchema,
  reorderAttributeValuesSchema,
  updateAttributeValueSchema,
} from "@/lib/schemas/catalog";
import { adminProcedure } from "@/server/api/orpc";
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
 * The store's filters and their values (FER-033), for the admin: every query
 * is on the store `adminProcedure` puts in the context, and every write
 * re-checks the caller's login inside its transaction.
 */
export const attributeRouter = {
  list: adminProcedure
    .handler(
      async ({ context }) =>
        await listStoreAttributes(context.db, { storeId: context.store.id })
    )
    .route({
      method: "GET",
      path: "/admin/filters",
      summary: "List a store's filters with their values and article counts",
      tags: ["filters"],
    }),

  create: adminProcedure
    .input(createAttributeSchema)
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
      path: "/admin/filters",
      summary: "Add a filter",
      tags: ["filters"],
    }),

  rename: adminProcedure
    .input(renameAttributeSchema)
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
      path: "/admin/filters/{id}",
      summary: "Rename a filter",
      tags: ["filters"],
    }),

  reorder: adminProcedure
    .input(reorderAttributesSchema)
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
      path: "/admin/filters/order",
      summary: "Put a store's filters in a new order",
      tags: ["filters"],
    }),

  delete: adminProcedure
    .input(deleteAttributeSchema)
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
      path: "/admin/filters/{id}",
      summary: "Delete a filter and its values",
      tags: ["filters"],
    }),

  createValue: adminProcedure
    .input(createAttributeValueSchema)
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
      path: "/admin/filter-values",
      summary: "Add a value to a filter",
      tags: ["filters"],
    }),

  updateValue: adminProcedure
    .input(updateAttributeValueSchema)
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
      path: "/admin/filter-values/{id}",
      summary: "Rename a filter value or change its swatch",
      tags: ["filters"],
    }),

  reorderValues: adminProcedure
    .input(reorderAttributeValuesSchema)
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
      path: "/admin/filter-values/order",
      summary: "Put a filter's values in a new order",
      tags: ["filters"],
    }),

  deleteValue: adminProcedure
    .input(deleteAttributeValueSchema)
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
      path: "/admin/filter-values/{id}",
      summary: "Delete a filter value, taking it off its articles",
      tags: ["filters"],
    }),
};
