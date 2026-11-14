import type { Locale } from "./config";

/**
 * The text to show a visitor reading in `locale`, out of the rows of a
 * `*_translation` table: their own language, else the one that exists, else
 * `null`. A store that only wrote its Spanish text still says something in
 * English, and the row's `locale` tells the caller which language it got, to
 * mark it with `lang`. With two languages "the one that exists" is a single
 * row; a third language will need an order of preference here.
 */
export function pickTranslation<Row extends { locale: Locale }>(
  rows: readonly Row[],
  locale: Locale
): Row | null {
  return rows.find((row) => row.locale === locale) ?? rows[0] ?? null;
}
