import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { addDays } from "@/lib/metrics/days";
import { DASHBOARD_DEFAULT_DAYS, dashboardSchema } from "@/lib/schemas/metrics";

/** The dashboard's range: business days, both included. */
export interface MetricsRange {
  from: string;
  to: string;
}

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The `days` days that end on `today`, today included. */
export function lastDays(days: number, today: string): MetricsRange {
  return { from: addDays(today, 1 - days), to: today };
}

/**
 * The dashboard's range from its query string (FER-030), which anyone can
 * edit: `from` and `to` as the API takes them, or the last
 * `DASHBOARD_DEFAULT_DAYS` days ending `today` when either is missing or
 * the pair is not a range the API takes (a made-up day, the wrong order,
 * longer than a year).
 */
export function readMetricsRange(
  searchParams: Record<string, SearchParamValue>,
  today: string
): MetricsRange {
  const parsed = dashboardSchema.safeParse({
    from: firstValue(searchParams.from),
    locale: "es",
    to: firstValue(searchParams.to),
  });

  return parsed.success
    ? { from: parsed.data.from, to: parsed.data.to }
    : lastDays(DASHBOARD_DEFAULT_DAYS, today);
}

/** The dashboard, with its range in the query string. */
export function metricsPath(locale: Locale, range?: MetricsRange): string {
  const path = localizePath("/admin/metrics", locale);

  return range
    ? `${path}?${new URLSearchParams({ from: range.from, to: range.to }).toString()}`
    : path;
}
