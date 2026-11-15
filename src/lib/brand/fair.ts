const DAY_MS = 86_400_000;

/**
 * The Christmas fair's first day, at midnight in Montevideo (UTC-3 all year):
 * what the coming-soon page counts down to.
 */
export const FAIR_OPENS_AT = new Date("2026-12-05T00:00:00-03:00");

/**
 * Whole days left until the fair opens, counting the one in progress: the
 * evening before is "1 day". Zero from the opening on.
 */
export function daysUntilFair(now: number): number {
  return Math.max(0, Math.ceil((FAIR_OPENS_AT.getTime() - now) / DAY_MS));
}
