/**
 * Every `Intl` formatter the app uses, built once per language and shared.
 * Components never construct `Intl.*` or call `toLocaleString()`: construction
 * is the slow part, and one module keeps every figure and date on screen in
 * agreement. A ratchet (`one-off-number-format`) holds the rest of the tree
 * to that.
 *
 * Nothing here knows which language the page is in: every formatter takes the
 * locale as an argument, from the URL on the server and from `useLocale()` in
 * a client component, so two requests in different languages never share one.
 */

import type { Locale } from "@/lib/i18n/config";

/**
 * The regional tag each language formats with. Spanish is Uruguay's; English
 * has no Uruguayan variant in CLDR, so it takes the US conventions.
 */
const INTL_LOCALES = { es: "es-UY", en: "en-US" } as const satisfies Record<
  Locale,
  string
>;

/**
 * The business time zone. Instants are stored in UTC; a date or time shown to
 * a user is formatted in this zone, never the host's (UTC on the server, the
 * user's on the client, so the two would also disagree during hydration).
 */
export const APP_TIME_ZONE = "America/Montevideo";

/** The currencies a store can sell in. Amounts are integers in minor units. */
export type Currency = "USD" | "UYU";

/** One instance per key, built the first time the key is asked for. */
function cached<T, Args extends string[]>(
  build: (...args: Args) => T
): (...args: Args) => T {
  const instances = new Map<string, T>();

  return (...args) => {
    const key = args.join("|");
    const existing = instances.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const built = build(...args);
    instances.set(key, built);

    return built;
  };
}

const relativeTimeFormat = cached(
  (tag: string) => new Intl.RelativeTimeFormat(tag, { numeric: "auto" })
);

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
export function formatRelativeTime(
  date: Date,
  now: number,
  locale: Locale
): string {
  const format = relativeTimeFormat(INTL_LOCALES[locale]);
  let seconds = Math.min(date.getTime() - now, 0) / 1000;

  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(seconds) < division.amount) {
      return format.format(Math.round(seconds), division.unit);
    }
    seconds /= division.amount;
  }

  return format.format(Math.round(seconds), "years");
}

const MINOR_UNITS = 100;

/**
 * One per tag, currency and number of decimals. Spanish uses the symbol a
 * Uruguayan reads every day (`$` for pesos, `US$` for dollars). English shows
 * the ISO code instead: a bare `$` in front of a visitor from abroad does not
 * say whether it means pesos or dollars.
 */
const priceFormat = cached(
  (tag: string, currency: Currency, fractionDigits: "0" | "2") =>
    new Intl.NumberFormat(tag, {
      style: "currency",
      currency,
      currencyDisplay: tag === INTL_LOCALES.es ? "symbol" : "code",
      minimumFractionDigits: Number(fractionDigits),
      maximumFractionDigits: Number(fractionDigits),
    })
);

/**
 * A price, from its amount in minor units (cents) and the store's currency:
 * `$ 1.290` and `US$ 12,50` in Spanish, `UYU 1,290` and `USD 12.50` in
 * English. Cents show only when the amount has any, so a round price stays
 * short and an amount is never rounded on screen.
 */
export function formatPrice(
  amountInMinorUnits: number,
  currency: Currency,
  locale: Locale
): string {
  const fractionDigits = amountInMinorUnits % MINOR_UNITS === 0 ? "0" : "2";

  return priceFormat(INTL_LOCALES[locale], currency, fractionDigits).format(
    amountInMinorUnits / MINOR_UNITS
  );
}

const integerFormat = cached(
  (tag: string) => new Intl.NumberFormat(tag, { maximumFractionDigits: 0 })
);

/**
 * A whole number with the language's grouping: `1.280` in Spanish, `1,280` in
 * English. A fraction is rounded: a count has none.
 */
export function formatInteger(value: number, locale: Locale): string {
  return integerFormat(INTL_LOCALES[locale]).format(value);
}

const dateFormat = cached(
  (tag: string) =>
    new Intl.DateTimeFormat(tag, {
      dateStyle: "long",
      timeZone: APP_TIME_ZONE,
    })
);

/**
 * A calendar day in the store's time zone ("4 de diciembre de 2026"), so an
 * order placed late at night in Montevideo never shows tomorrow's date.
 */
export function formatDate(date: Date, locale: Locale): string {
  return dateFormat(INTL_LOCALES[locale]).format(date);
}

const decimalSeparator = cached(
  (tag: string) =>
    new Intl.NumberFormat(tag)
      .formatToParts(1.5)
      .find((part) => part.type === "decimal")?.value ?? "."
);

/** What a number field's text stands for. */
export type TypedNumber =
  | { kind: "empty" }
  | { kind: "number"; value: number }
  | { kind: "refused"; reason: "decimal" | "unreadable" };

// Spaces, no-break spaces and narrow no-break spaces: what a pasted figure
// groups its thousands with in several languages.
const SPACES = /[\s\u00A0\u202F]/gu;
const DIGITS_AND_SEPARATORS = /^[\d.,]+$/u;
const GROUPED_BY_DOT = /^[1-9]\d{0,2}(?:\.\d{3})+$/u;
const GROUPED_BY_COMMA = /^[1-9]\d{0,2}(?:,\d{3})+$/u;
const THOUSANDS_DIGITS = 3;

/** The integer digits of `text` when it is grouped by `separator`, or null. */
function readGrouped(text: string, separator: "," | "."): string | null {
  const grouped = separator === "." ? GROUPED_BY_DOT : GROUPED_BY_COMMA;
  return grouped.test(text) ? text.replaceAll(separator, "") : null;
}

/**
 * What a person typed or pasted into a number field, whatever the page's
 * language and whatever keypad their phone shows (FER-035). The keypad follows
 * the phone's region, not the page, so the notation cannot come from the
 * locale: either separator is read the same way on `/` and on `/en`.
 *
 * - One separator followed by one or two digits (or none yet) is the decimal
 *   point: `12,50` and `12.50` are twelve and a half.
 * - One separator followed by exactly three digits groups thousands, the way a
 *   Uruguayan writes a price: `1.500` and `1,500` are fifteen hundred. A price
 *   never has three decimals.
 * - Both separators: the last one is the decimal point and the other groups
 *   thousands (`1.500,25`, `1,500.25`).
 * - Anything else that could be read two ways (`0,500`, `1.23.4`, `1234,567`)
 *   is refused instead of guessed, so a value never changes magnitude
 *   silently.
 */
export function readTypedNumber(
  typed: string,
  { allowDecimal = true }: { allowDecimal?: boolean } = {}
): TypedNumber {
  const compact = typed.replaceAll(SPACES, "");
  const negative = compact.startsWith("-");
  const body = negative ? compact.slice(1) : compact;

  if (body === "" || body === "." || body === ",") {
    return { kind: "empty" };
  }

  if (!DIGITS_AND_SEPARATORS.test(body)) {
    return { kind: "refused", reason: "unreadable" };
  }

  const reading = readDigits(body);

  if (reading === null) {
    return { kind: "refused", reason: "unreadable" };
  }

  if (reading.fraction !== null && !allowDecimal) {
    return { kind: "refused", reason: "decimal" };
  }

  // A trailing 0 completes a fraction still being typed ("12," is "12.0")
  // without changing one that is there ("12,5" is "12.50"), and a leading one
  // an integer part left out (",5" is "0.5").
  const value = Number(
    `${negative ? "-" : ""}0${reading.integer}.${reading.fraction ?? ""}0`
  );

  // `-0` reads back as "0" anyway; a field never holds a negative zero.
  return { kind: "number", value: value === 0 ? 0 : value };
}

/** The integer and fraction digits of an unsigned figure, or null. */
function readDigits(
  body: string
): { fraction: string | null; integer: string } | null {
  const lastSeparatorAt = Math.max(
    body.lastIndexOf("."),
    body.lastIndexOf(",")
  );

  if (lastSeparatorAt === -1) {
    return { integer: body, fraction: null };
  }

  const last = body[lastSeparatorAt] === "." ? "." : ",";
  const other = last === "." ? "," : ".";
  const before = body.slice(0, lastSeparatorAt);
  const after = body.slice(lastSeparatorAt + 1);

  if (before.includes(other)) {
    // Both separators: the last is the decimal point, the other groups.
    const integer = readGrouped(before, other);
    return integer === null || before.includes(last)
      ? null
      : { integer, fraction: after };
  }

  if (before.includes(last)) {
    // The same separator more than once can only group thousands.
    const integer = readGrouped(body, last);
    return integer === null ? null : { integer, fraction: null };
  }

  if (after.length === THOUSANDS_DIGITS) {
    // `1.500` is fifteen hundred; `0,500` or `1234,567` could be either.
    const integer = readGrouped(body, last);
    return integer === null ? null : { integer, fraction: null };
  }

  return { integer: before, fraction: after };
}

/**
 * The other direction: plain `-1234.5` text written with the language's
 * decimal separator and no grouping ("-1234,5" in Spanish), which is what a
 * number field shows once focus leaves it. `readTypedNumber` reads it back to
 * the same number.
 */
export function fromPlainNumberText(plain: string, locale: Locale): string {
  return plain.replace(".", decimalSeparator(INTL_LOCALES[locale]));
}
