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

const numberSeparators = cached((tag: string) => {
  const parts = new Intl.NumberFormat(tag).formatToParts(12_345.6);
  const separator = (type: "decimal" | "group") =>
    parts.find((part) => part.type === type)?.value ?? "";

  return { decimal: separator("decimal"), group: separator("group") };
});

/**
 * What a user typed into a number field, in their language's notation, as the
 * plain `-1234.5` text `Number()` reads: grouping separators dropped, the
 * decimal separator turned into a dot. "1.500,5" in Spanish and "1,500.5" in
 * English are both 1500.5; hard-coding either convention would read the other
 * as 1.5005.
 */
export function toPlainNumberText(typed: string, locale: Locale): string {
  const { decimal, group } = numberSeparators(INTL_LOCALES[locale]);

  return typed.replaceAll(group, "").replaceAll(decimal, ".");
}

/**
 * The other direction: plain `-1234.5` text written with the language's
 * decimal separator and no grouping ("-1234,5" in Spanish), which is what a
 * number field shows while it is being typed in. `toPlainNumberText` reads it
 * back to the same number.
 */
export function fromPlainNumberText(plain: string, locale: Locale): string {
  return plain.replace(".", numberSeparators(INTL_LOCALES[locale]).decimal);
}
