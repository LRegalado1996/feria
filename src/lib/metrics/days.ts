const DAY_MS = 86_400_000;

/** A `YYYY-MM-DD` day as a count of days, read at UTC midnight. */
function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS;
}

/**
 * The day `amount` days after `day` (before, when negative). Days are
 * calendar days, never instants (docs/agents/database.md § Time), so the
 * arithmetic runs at UTC midnight and no time zone shifts it.
 */
export function addDays(day: string, amount: number): string {
  return new Date((dayNumber(day) + amount) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** How many days `from` to `to` holds, both included. */
export function daySpan(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from) + 1;
}

/** Every day from `from` to `to`, both included, in order. */
export function eachDay(from: string, to: string): string[] {
  return Array.from({ length: Math.max(0, daySpan(from, to)) }, (_, index) =>
    addDays(from, index)
  );
}
