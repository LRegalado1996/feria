import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { isStorefrontLaunched } from "@/lib/env/launch";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { absoluteUrl, siteOrigin } from "@/lib/seo/origin";
import { db } from "@/server/db";
import {
  listIndexableArticles,
  listIndexableStores,
} from "@/server/services/seo";

/** One page in every language, each naming the others (`hreflang`). */
function entries(
  origin: string,
  path: string,
  lastModified: Date
): MetadataRoute.Sitemap {
  const at = (locale: Locale) =>
    absoluteUrl(localizePath(path, locale), origin);
  // Spelled out so a new language fails the typecheck until it is listed.
  const languages: Record<Locale, string> = { en: at("en"), es: at("es") };

  return LOCALES.map((locale) => ({
    alternates: { languages },
    lastModified,
    url: languages[locale],
  }));
}

/** The later of `dates`. */
function latest(dates: Date[]) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

/**
 * `sitemap.xml` (FER-024): each active store's home, its catalog and every
 * published article, in Spanish and English. Read at request time, so a new
 * article is listed at once and the build needs no database. Empty while
 * the storefront is closed: every page leads to the coming-soon page then.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  if (!isStorefrontLaunched()) {
    return [];
  }

  const origin = siteOrigin();
  const stores = await listIndexableStores(db);
  const perStore = await Promise.all(
    stores.map(async (store) => {
      const articles = await listIndexableArticles(db, { storeId: store.id });
      const home = `/${store.slug}`;

      return [
        ...entries(origin, home, store.updatedAt),
        ...entries(
          origin,
          `${home}/products`,
          latest([store.updatedAt, ...articles.map((row) => row.updatedAt)])
        ),
        ...articles.flatMap((article) =>
          entries(origin, `${home}/products/${article.slug}`, article.updatedAt)
        ),
      ];
    })
  );

  return perStore.flat();
}
