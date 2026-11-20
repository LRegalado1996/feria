const DAY_MS = 86_400_000;

/**
 * The Christmas fair's first day, at midnight in Montevideo (UTC-3 all year):
 * what the coming-soon page counts down to until an admin names another day.
 */
export const FAIR_OPENS_AT = new Date("2026-12-05T00:00:00-03:00");

/**
 * The instant the countdown counts to: midnight in Montevideo of `day`
 * (`YYYY-MM-DD`, as the admin chose it, FER-034), or the fair's opening when
 * no day was chosen. Uruguay keeps UTC-3 all year (no daylight saving since
 * 2015), so the offset is fixed.
 */
export function countdownTarget(day: string | null): Date {
  return day === null ? FAIR_OPENS_AT : new Date(`${day}T00:00:00-03:00`);
}

/**
 * Whole days left until `target`, counting the one in progress: the evening
 * before is "1 day". Zero from `target` on.
 */
export function daysUntil(target: Date, now: number): number {
  return Math.max(0, Math.ceil((target.getTime() - now) / DAY_MS));
}
