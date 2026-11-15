import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";
import { storeScopeSchema } from "@/lib/schemas/access";
import { INT4_MAX } from "@/lib/schemas/catalog";
import { storeSlugSchema } from "@/lib/schemas/store";
import { normalizePhone } from "@/lib/utils/phone";

/** An order's states, in the order it moves through them (FER-025). */
export const ORDER_STATUSES = [
  "received",
  "packed",
  "delivered",
  "undeliverable",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Where each state can go: forward along the delivery, or one step back to
 * correct a mistake (a "packed" tapped by accident, a delivery marked on the
 * wrong order).
 */
export const ORDER_MOVES: Record<OrderStatus, readonly OrderStatus[]> = {
  delivered: ["packed"],
  packed: ["delivered", "undeliverable", "received"],
  received: ["packed"],
  undeliverable: ["packed"],
};

// Abuse caps Lucas set on 2026-11-14 (FER-025).
export const ORDER_ITEMS_MAX = 20;
export const ORDER_QUANTITY_MAX = 10;
export const ORDERS_PER_PHONE_PER_HOUR = 5;
export const ORDERS_PER_IP_PER_HOUR = 20;

export const ORDER_CUSTOMER_NAME_MAX_LENGTH = 80;
export const ORDER_NOTE_MAX_LENGTH = 500;
/** What a phone field may hold as typed, spaces and dashes included. */
export const ORDER_PHONE_MAX_LENGTH = 30;
export const ORDERS_PAGE_SIZE = 50;

/** The short code read aloud at the stall: no 0/O, 1/I/L to mix up. */
export const ORDER_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ORDER_CODE_LENGTH = 5;
/** The public link's key: 32 random bytes, base64url. */
export const ORDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Not coerced: a JSON body sends numbers as numbers.
const bodyIdSchema = z.number().int().positive().max(INT4_MAX);
const idSchema = z.coerce.number().int().positive().max(INT4_MAX);

export const orderItemInputSchema = z.object({
  productId: bodyIdSchema,
  quantity: z.number().int().min(1).max(ORDER_QUANTITY_MAX),
});

/**
 * An anonymous shopper's order: the articles and how many of each, never a
 * price, which the server computes. `requestKey` is the checkout's own id
 * for this submit, so a double tap or a resubmit creates one order.
 */
export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(ORDER_CUSTOMER_NAME_MAX_LENGTH),
  customerPhone: z
    .string()
    .trim()
    .min(1)
    .max(ORDER_PHONE_MAX_LENGTH)
    .transform((typed, context) => {
      const phone = normalizePhone(typed);

      if (phone === null) {
        context.addIssue({ code: "custom", message: "Not a phone number" });
        return z.NEVER;
      }

      return phone;
    }),
  items: z
    .array(orderItemInputSchema)
    .min(1)
    .max(ORDER_ITEMS_MAX)
    .refine(
      (items) =>
        new Set(items.map((item) => item.productId)).size === items.length,
      "Each article appears once, with its quantity"
    ),
  locale: z.enum(LOCALES),
  note: z
    .string()
    .trim()
    .max(ORDER_NOTE_MAX_LENGTH)
    .transform((note) => (note === "" ? null : note))
    .nullable(),
  // A v4 uuid, as `crypto.randomUUID()` makes: never the nil uuid or
  // another fixed one two checkouts could share.
  requestKey: z.uuidv4(),
  storeSlug: storeSlugSchema,
});

export type CreateOrderValues = z.infer<typeof createOrderSchema>;

export const getOrderByTokenSchema = z.object({
  storeSlug: storeSlugSchema,
  token: z.string().regex(ORDER_TOKEN_PATTERN),
});

/** The store's orders, newest first, one status or all, a page at a time. */
export const listOrdersSchema = storeScopeSchema.extend({
  cursor: z
    .object({
      createdAt: z.coerce.date(),
      id: idSchema,
    })
    .optional(),
  status: z.enum(ORDER_STATUSES).optional(),
});

export const getOrderSchema = storeScopeSchema.extend({ id: idSchema });

export const changeOrderStatusSchema = storeScopeSchema.extend({
  id: idSchema,
  status: z.enum(ORDER_STATUSES),
});
