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
 * ahead of `now` (an order placed since the clock last ticked) reads "now".
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
 * How Spanish writes each currency: the sign a Uruguayan reads every day.
 * Spelled here, never asked of `Intl`: Chrome for Android ships no symbol
 * for the peso (its ICU keeps the largest economies' currencies only), so
 * `currencyDisplay: "symbol"` wrote `UYU 1.290` there and `$ 1.290` on the
 * server, and every list of prices failed to hydrate on an Android phone.
 */
const SPANISH_SIGNS = { USD: "US$", UYU: "$" } as const satisfies Record<
  Currency,
  string
>;

/**
 * One per tag, currency and number of decimals. Always the ISO code, the one
 * currency display every runtime writes alike; Spanish swaps it for its sign
 * (`writtenCurrency`).
 */
const priceFormat = cached(
  (tag: string, currency: Currency, fractionDigits: "0" | "2") =>
    new Intl.NumberFormat(tag, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: Number(fractionDigits),
      maximumFractionDigits: Number(fractionDigits),
    })
);

/**
 * A currency as the language writes it. English keeps the ISO code: a bare
 * `$` in front of a visitor from abroad does not say whether it means pesos
 * or dollars.
 */
function writtenCurrency(currency: Currency, locale: Locale): string {
  return locale === "es" ? SPANISH_SIGNS[currency] : currency;
}

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
  const written = writtenCurrency(currency, locale);

  return priceFormat(INTL_LOCALES[locale], currency, fractionDigits)
    .formatToParts(amountInMinorUnits / MINOR_UNITS)
    .map((part) => (part.type === "currency" ? written : part.value))
    .join("");
}

/**
 * How a price's currency is written beside its figure, as `formatPrice`
 * writes it: `$` and `US$` in Spanish, `UYU` and `USD` in English. For a
 * field that takes an amount and shows its currency inside it.
 */
export function formatCurrencySign(currency: Currency, locale: Locale): string {
  return writtenCurrency(currency, locale);
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

const percentFormat = cached(
  (tag: string) =>
    new Intl.NumberFormat(tag, { maximumFractionDigits: 0, style: "percent" })
);

/**
 * A share from 0 to 100 as a whole percentage in the language's notation
 * (an upload's progress): `46%` for 45.6, rounded, never a fraction.
 */
export function formatPercent(value: number, locale: Locale): string {
  return percentFormat(INTL_LOCALES[locale]).format(value / 100);
}

const listFormat = cached(
  (tag: string) =>
    new Intl.ListFormat(tag, { style: "long", type: "conjunction" })
);

/**
 * Names joined as a sentence says them: "Cadenas, Anillos y Aros" in
 * Spanish, "Chains, Rings, and Earrings" in English.
 */
export function formatList(items: readonly string[], locale: Locale): string {
  return listFormat(INTL_LOCALES[locale]).format(items);
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

const calendarDayFormat = cached(
  (tag: string) =>
    new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    })
);

/**
 * A day kept as `YYYY-MM-DD` (a start or end date, FER-020) as the language
 * writes it ("5 dic 2026"). The day is a day, not an instant, so it is read
 * and written at UTC midnight and never shifts by a time zone.
 */
export function formatCalendarDay(day: string, locale: Locale): string {
  return calendarDayFormat(INTL_LOCALES[locale]).format(
    new Date(`${day}T00:00:00Z`)
  );
}

const dayMonthFormat = cached(
  (tag: string) =>
    new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
);

/**
 * A `YYYY-MM-DD` day as its day and month alone ("5 dic."), for a chart's
 * axis, where the year is the range's: read at UTC midnight, never shifted.
 */
export function formatDayMonth(day: string, locale: Locale): string {
  return dayMonthFormat(INTL_LOCALES[locale]).format(
    new Date(`${day}T00:00:00Z`)
  );
}

const businessClock = cached(
  () =>
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      second: "2-digit",
      timeZone: APP_TIME_ZONE,
      year: "numeric",
    })
);

/** The business time zone's calendar and clock at `now`, as numbers. */
function businessParts(now: Date) {
  const parts = Object.fromEntries(
    businessClock()
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    secondOfDay:
      Number(parts.hour) * 3600 +
      Number(parts.minute) * 60 +
      Number(parts.second),
  };
}

/**
 * The business day `now` falls on (`YYYY-MM-DD` in `APP_TIME_ZONE`): the
 * one helper every "today" comes from (docs/agents/database.md § Time), so
 * a banner that ends on December 5 shows until midnight in Montevideo, not
 * in UTC.
 */
export function businessDay(now: Date): string {
  return businessParts(now).day;
}

/** Whole seconds from `now` to the next business day's midnight, at least 1. */
export function secondsUntilNextBusinessDay(now: Date): number {
  return Math.max(1, 86_400 - businessParts(now).secondOfDay);
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
// groups its thousands with in several languages. Inside a figure they are
// read only as that grouping, in the integer part.
const SPACE = /[\s\u00A0\u202F]/u;
const SPACES = /[\s\u00A0\u202F]/gu;
const GROUPED_BY_SPACE = /^[1-9]\d{0,2}(?:[\s\u00A0\u202F]\d{3})+$/u;
// The minus sign some sources paste instead of a hyphen.
const MINUS_SIGN = "\u2212";
// A JavaScript number holds 15 significant digits exactly; beyond that
// `Number()` rounds the figure silently. No price or count gets near it.
const MOST_SIGNIFICANT_DIGITS = 15;
// Beyond six decimals `String()` writes a value in exponent form ("1e-7"),
// and a long enough run of zeros reads as 0: no price or count needs more.
const MOST_DECIMALS = 6;
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
  const trimmed = typed.trim().replace(MINUS_SIGN, "-");
  const negative = trimmed.startsWith("-");
  const signless = negative ? trimmed.slice(1) : trimmed;
  const body = readSpaceGrouping(signless);

  if (body === null) {
    return { kind: "refused", reason: "unreadable" };
  }

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

  // Trailing zeros of a fraction change nothing ("12,50" is "12,5"), so they
  // count toward neither limit: the field's own rewrite pads three decimals.
  const fraction = (reading.fraction ?? "").replace(/0+$/u, "");
  const significant = `${reading.integer}${fraction}`.replace(/^0+/u, "");

  if (
    fraction.length > MOST_DECIMALS ||
    significant.length > MOST_SIGNIFICANT_DIGITS
  ) {
    return { kind: "refused", reason: "unreadable" };
  }

  // The leading 0 stands in for an integer part left out (",5" is "0.5").
  const value = Number(
    `${negative ? "-" : ""}0${reading.integer}.${fraction}0`
  );

  // `-0` reads back as "0" anyway; a field never holds a negative zero.
  return { kind: "number", value: value === 0 ? 0 : value };
}

/**
 * The figure with its space grouping removed, or null when a space sits
 * anywhere but between groups of three in the integer part: `12 50` is not
 * twelve hundred and fifty, it is a typo.
 */
function readSpaceGrouping(signless: string): string | null {
  if (!SPACE.test(signless)) {
    return signless;
  }

  const firstSeparatorAt = signless.search(/[.,]/u);
  const integer =
    firstSeparatorAt === -1 ? signless : signless.slice(0, firstSeparatorAt);
  const rest = firstSeparatorAt === -1 ? "" : signless.slice(firstSeparatorAt);

  return GROUPED_BY_SPACE.test(integer) && !SPACE.test(rest)
    ? `${integer.replaceAll(SPACES, "")}${rest}`
    : null;
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
 * the same number, three decimals included.
 */
export function fromPlainNumberText(plain: string, locale: Locale): string {
  // Three decimals would read back as a thousands group ("1,234" is 1234), so
  // they get a trailing zero that keeps them a fraction ("1,2340").
  const [integer = "", fraction] = plain.split(".");
  const written =
    fraction?.length === THOUSANDS_DIGITS ? `${integer}.${fraction}0` : plain;

  return written.replace(".", decimalSeparator(INTL_LOCALES[locale]));
}
