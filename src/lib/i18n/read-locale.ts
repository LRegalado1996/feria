import { notFound } from "next/navigation";

import { isLocale, type Locale } from "./config";

/**
 * The language of a route under `app/[locale]`, from the `params` its layout
 * or page received. A route param is any string, so a segment that is not a
 * language of the product answers 404 here, once, instead of reaching a
 * dictionary lookup.
 */
export async function readLocale(
  params: Promise<{ locale: string }>
): Promise<Locale> {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return locale;
}
