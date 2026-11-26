import { z } from "zod";

import { LOCALES } from "@/lib/i18n/config";
import { daySpan } from "@/lib/metrics/days";
import { INT4_MAX } from "@/lib/schemas/catalog";
import { isCalendarDate } from "@/lib/schemas/page";

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

/** The longest range the dashboard reads at once (FER-030): a year. */
export const DASHBOARD_RANGE_MAX_DAYS = 366;
/** The ranges offered as one tap, in days ending today. */
export const DASHBOARD_RANGE_PRESETS = [7, 30, 90, 365] as const;
/** The range the dashboard opens on. */
export const DASHBOARD_DEFAULT_DAYS = 30;
/** How many articles each of the dashboard's rankings lists. */
export const DASHBOARD_TOP_LIMIT = 10;

const calendarDaySchema = z
  .string()
  .refine(isCalendarDate, { error: "Enter a date as YYYY-MM-DD" });

/**
 * The dashboard's range (FER-030): business days in Montevideo, both
 * included, at most `DASHBOARD_RANGE_MAX_DAYS` long, and the language its
 * article titles come in.
 */
export const dashboardSchema = z
  .strictObject({
    from: calendarDaySchema,
    locale: z.enum(LOCALES),
    to: calendarDaySchema,
  })
  .refine(({ from, to }) => from <= to, {
    error: "The range ends before it starts",
    path: ["to"],
  })
  .refine(({ from, to }) => daySpan(from, to) <= DASHBOARD_RANGE_MAX_DAYS, {
    error: `Keep the range to ${DASHBOARD_RANGE_MAX_DAYS} days`,
    path: ["from"],
  });

export type DashboardValues = z.infer<typeof dashboardSchema>;
