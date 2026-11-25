import { z } from "zod";

import { INT4_MAX } from "@/lib/schemas/catalog";

// What one client (an IP, an IPv6 /64) may add in a business day, set by
// Lucas on 2026-11-25 (FER-029). Many shoppers at the fair may share one
// address (its Wi-Fi, a carrier's NAT), so the caps stop a script, not them.
export const PRODUCT_VIEWS_PER_CLIENT_PER_DAY = 20;
export const STORE_VISITS_PER_CLIENT_PER_DAY = 100;

/**
 * An article seen on its page (FER-029). Strict, and a number as JSON sends
 * it: anything else is not a page of this site calling.
 */
export const countViewSchema = z.strictObject({
  productId: z.number().int().positive().max(INT4_MAX),
});

export type CountViewValues = z.infer<typeof countViewSchema>;
