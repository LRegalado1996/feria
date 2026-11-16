import { z } from "zod";

import { ORDER_ITEMS_MAX, orderItemInputSchema } from "@/lib/schemas/order";

/**
 * A store's cart as the browser keeps it (FER-021): which articles and how
 * many, never a price, which the server reads at checkout (FER-025). Read
 * from storage, which anything on the device could have written, so a cart
 * that does not parse is an empty cart.
 */
export const cartSchema = z
  .array(orderItemInputSchema)
  .max(ORDER_ITEMS_MAX)
  .refine(
    (items) =>
      new Set(items.map((item) => item.productId)).size === items.length
  );

export type Cart = z.infer<typeof cartSchema>;

export {
  ORDER_ITEMS_MAX as CART_ITEMS_MAX,
  ORDER_QUANTITY_MAX as CART_QUANTITY_MAX,
} from "@/lib/schemas/order";
