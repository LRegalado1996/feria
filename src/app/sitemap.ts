import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { ALL_ARTICLES_PATH, articlePath } from "@/lib/catalog/paths";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { absoluteUrl, siteOrigin } from "@/lib/seo/origin";
import { readComingSoon } from "@/server/cache/coming-soon";
import { db } from "@/server/db";
import {
  findIndexableStore,
  listIndexableArticles,
  listIndexableCategories,
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
 * `sitemap.xml` (FER-024): the store's home, the page of all its articles,
 * each group and category page that lists one (FER-043) and every published
 * article, in Spanish and English. Read at request time, so a new article
 * is listed at once and the build needs no database. Empty while the
 * coming-soon page is published (FER-034): every page leads to it then. The
 * switch is the cached read the admin's flip invalidates.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  if ((await readComingSoon()).published) {
    return [];
  }

  const origin = siteOrigin();
  const store = await findIndexableStore(db);

  // Only a database whose migrations have not run has no store.
  if (!store) {
    return [];
  }

  const [articles, categories] = await Promise.all([
    listIndexableArticles(db, { storeId: store.id }),
    // A page's address is the same in both languages: the names are not
    // listed, so either language reads them.
    listIndexableCategories(db, { locale: DEFAULT_LOCALE, storeId: store.id }),
  ]);
  const catalogChanged = latest([
    store.updatedAt,
    ...articles.map((row) => row.updatedAt),
  ]);

  return [
    ...entries(origin, "/", store.updatedAt),
    ...entries(origin, ALL_ARTICLES_PATH, catalogChanged),
    // Every group and category page with a published article (FER-043),
    // changed with the catalog or with its own texts.
    ...categories.flatMap((category) =>
      entries(
        origin,
        category.path,
        latest([catalogChanged, category.updatedAt])
      )
    ),
    ...articles.flatMap((article) =>
      entries(origin, articlePath(article.slug), article.updatedAt)
    ),
  ];
}
