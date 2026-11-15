import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";
import { INT4_MAX } from "@/lib/schemas/catalog";
import { ORDER_ITEMS_MAX, orderItemInputSchema } from "@/lib/schemas/order";
import { storeSlugSchema } from "@/lib/schemas/store";

/**
 * One line of the cart: an order's item, plus the price the shopper saw when
 * adding it (FER-026), only to say so when it changed. The order never
 * sends it: the server prices every order itself.
 */
export const cartItemSchema = orderItemInputSchema.extend({
  seenPriceAmount: z.number().int().min(0).max(INT4_MAX).optional(),
});

/**
 * A store's cart as the browser keeps it (FER-021): which articles and how
 * many, and the price seen when each was added, which is never what is
 * charged (the server prices the order, FER-025). Read from storage, which
 * anything on the device could have written, so a cart that does not parse
 * is an empty cart.
 */
export const cartSchema = z
  .array(cartItemSchema)
  .max(ORDER_ITEMS_MAX)
  .refine(
    (items) =>
      new Set(items.map((item) => item.productId)).size === items.length
  );

export type Cart = z.infer<typeof cartSchema>;

/**
 * The cart's articles as they are now (FER-026): their price and whether
 * they can be bought, read when the cart opens. Coerced: the REST surface
 * reads the ids from the query string, and `Number("")` is 0, which
 * `positive()` refuses.
 */
export const listCartProductsSchema = z.object({
  ids: z
    .array(z.coerce.number().int().positive().max(INT4_MAX))
    .min(1)
    .max(ORDER_ITEMS_MAX)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Each article is asked for once"
    ),
  locale: z.enum(LOCALES),
  storeSlug: storeSlugSchema,
});

export type ListCartProductsValues = z.infer<typeof listCartProductsSchema>;

export {
  ORDER_ITEMS_MAX as CART_ITEMS_MAX,
  ORDER_QUANTITY_MAX as CART_QUANTITY_MAX,
} from "@/lib/schemas/order";
