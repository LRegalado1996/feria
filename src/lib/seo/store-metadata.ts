import type { Metadata } from "next";

import type { Locale } from "@/lib/i18n/config";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import type { PublicStore } from "@/server/services/store";

/** A store page's title: the page's own, then the store's name. */
export function storeTitle(title: string, storeName: string): string {
  return `${title} · ${storeName}`;
}

/**
 * What every store page says about the store unless it says more: the
 * tagline in `locale` as the description, and a share card under the store's
 * name. The layout cannot say it, since it reads no data (FER-038).
 */
export function storeMetadata(
  store: Pick<PublicStore, "name" | "translations">,
  locale: Locale
): Pick<Metadata, "description" | "openGraph"> {
  const tagline = pickTranslation(store.translations, locale)?.tagline;

  return {
    description: tagline,
    openGraph: { description: tagline, siteName: store.name, type: "website" },
  };
}
