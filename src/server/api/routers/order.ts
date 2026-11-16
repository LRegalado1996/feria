import { ORPCError } from "@orpc/server";

import {
  isStorefrontLaunchedFor,
  LAUNCH_OVERRIDE_HEADER,
} from "@/lib/env/launch";
import {
  changeOrderStatusSchema,
  createOrderSchema,
  getOrderByTokenSchema,
  getOrderSchema,
  listOrdersSchema,
  orderCountsSchema,
} from "@/lib/schemas/order";
import { publicProcedure, storeProcedure } from "@/server/api/orpc";
import { isBotRequest } from "@/server/api/utils/bot-check";
import { orderClientKey } from "@/server/api/utils/client-key";
import { safeRequestLogger } from "@/server/api/utils/logger";
import { writeToStore } from "@/server/api/utils/write-to-store";
import {
  changeOrderStatus,
  countOrders,
  createOrder,
  getOrder,
  getOrderByToken,
  listOrders,
} from "@/server/services/order";
import { getActiveStoreBySlug } from "@/server/services/store";

/**
 * Orders (FER-025). A shopper creates one and reads it back by its link's
 * token, without an account; a store's members list, read and move its
 * orders through `storeProcedure`.
 */
export const orderRouter = {
  create: publicProcedure
    .input(createOrderSchema)
    .handler(async ({ context, input }) => {
      // A closed storefront takes no orders, whatever reaches the API.
      if (
        !isStorefrontLaunchedFor(context.headers.get(LAUNCH_OVERRIDE_HEADER))
      ) {
        throw new ORPCError("NOT_FOUND", { message: "Store not found" });
      }

      // A script placing orders is refused before anything is read.
      if (await isBotRequest()) {
        throw new ORPCError("FORBIDDEN", { message: "Request refused" });
      }

      const { storeSlug, ...values } = input;
      const store = await getActiveStoreBySlug(context.db, { slug: storeSlug });
      const clientKey = orderClientKey(context.headers);

      // The per-client limit fails open (only the phone limit applies); on
      // a deployment, where the platform always gives the IP, that is
      // worth seeing in the request's log line.
      if (clientKey === null) {
        safeRequestLogger()?.set({ order: { clientLimit: "skipped" } });
      }

      return await createOrder(context.db, {
        clientKey,
        storeId: store.id,
        values,
      });
    })
    .route({
      method: "POST",
      path: "/stores/{storeSlug}/orders",
      summary: "Place an order; prices come from the server",
      tags: ["orders"],
    }),

  getByToken: publicProcedure
    .input(getOrderByTokenSchema)
    .handler(async ({ context, input }) => {
      const store = await getActiveStoreBySlug(context.db, {
        slug: input.storeSlug,
      });

      return await getOrderByToken(context.db, {
        storeId: store.id,
        token: input.token,
      });
    })
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/orders/{token}",
      summary: "An order's public page, by its link's token",
      tags: ["orders"],
    }),

  list: storeProcedure(listOrdersSchema)
    .handler(
      async ({ context, input }) =>
        await listOrders(context.db, {
          cursor: input.cursor,
          q: input.q,
          status: input.status,
          storeId: context.store.id,
        })
    )
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/admin/orders",
      summary: "A store's orders, newest first",
      tags: ["orders"],
    }),

  counts: storeProcedure(orderCountsSchema)
    .handler(
      async ({ context }) =>
        await countOrders(context.db, { storeId: context.store.id })
    )
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/admin/order-counts",
      summary: "How many of the store's orders are in each status",
      tags: ["orders"],
    }),

  get: storeProcedure(getOrderSchema)
    .handler(
      async ({ context, input }) =>
        await getOrder(context.db, { id: input.id, storeId: context.store.id })
    )
    .route({
      method: "GET",
      path: "/stores/{storeSlug}/admin/orders/{id}",
      summary: "One order with its items and status history",
      tags: ["orders"],
    }),

  changeStatus: storeProcedure(changeOrderStatusSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx, storeId) =>
            await changeOrderStatus(tx, {
              id: input.id,
              status: input.status,
              storeId,
              userId: context.session.user.id,
            })
        )
    )
    .route({
      method: "PUT",
      path: "/stores/{storeSlug}/admin/orders/{id}/status",
      summary: "Move an order to its next status, or one step back",
      tags: ["orders"],
    }),
};
