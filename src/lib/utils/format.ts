/**
 * The app's one locale and time zone, and every `Intl` formatter built from
 * them. Components never construct `Intl.*` or call `toLocaleString()`: a
 * formatter is built once here (construction is the slow part) and every
 * display shares it. A ratchet (`one-off-number-format`) holds the rest of the
 * tree to that.
 */

/** Drives `<html lang>` and every formatter below. One product language per app. */
export const APP_LOCALE = "en-US";

/**
 * The business time zone. Instants are stored in UTC; a date or time shown to
 * a user is formatted in this zone, never the host's (UTC on the server, the
 * user's on the client, so the two would also disagree during hydration).
 */
export const APP_TIME_ZONE = "UTC";

const relativeTime = new Intl.RelativeTimeFormat(APP_LOCALE, {
  numeric: "auto",
});

const RELATIVE_DIVISIONS: {
  amount: number;
  unit: Intl.RelativeTimeFormatUnit;
}[] = [
  { amount: 60, unit: "seconds" },
  { amount: 60, unit: "minutes" },
  { amount: 24, unit: "hours" },
  { amount: 7, unit: "days" },
  { amount: 4.34524, unit: "weeks" },
  { amount: 12, unit: "months" },
];

/**
 * `date` relative to `now`, which the caller passes in rather than this
 * reading the clock: a render that reads `Date.now()` disagrees with its own
 * hydration, and the React Compiler memoizes it as if it were pure. A `date`
 * ahead of `now` (a post created since the clock last ticked) reads "now".
 */
export function formatRelativeTime(date: Date, now: number): string {
  let seconds = Math.min(date.getTime() - now, 0) / 1000;

  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(seconds) < division.amount) {
      return relativeTime.format(Math.round(seconds), division.unit);
    }
    seconds /= division.amount;
  }

  return relativeTime.format(Math.round(seconds), "years");
}

const numberParts = new Intl.NumberFormat(APP_LOCALE).formatToParts(12_345.6);

function separator(type: "decimal" | "group"): string {
  return numberParts.find((part) => part.type === type)?.value ?? "";
}

const GROUP_SEPARATOR = separator("group");
const DECIMAL_SEPARATOR = separator("decimal");

/**
 * What a user typed into a number field, in the app locale's notation, as the
 * plain `-1234.5` text `Number()` reads: grouping separators dropped, the
 * locale's decimal separator turned into a dot. In en-US "1,500.5" is 1500.5;
 * hard-coding "comma means decimal" would read it as 1.5005.
 */
export function toPlainNumberText(typed: string): string {
  return typed
    .replaceAll(GROUP_SEPARATOR, "")
    .replaceAll(DECIMAL_SEPARATOR, ".");
}
