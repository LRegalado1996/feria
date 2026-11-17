import type { Dictionary } from "@/content/es";
import { catalogHref, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { absoluteUrl } from "@/lib/seo/origin";
import { type Currency, formatPrice } from "@/lib/utils/format";
import type { IndexableArticle, IndexableStore } from "@/server/services/seo";

export interface StoreLlmsInput {
  articles: Pick<IndexableArticle, "priceAmount" | "slug" | "titles">[];
  categories: { name: string; path: string }[];
  copy: Dictionary["seo"]["llms"];
  currencyCode: Currency;
  locale: Locale;
  origin: string;
  store: Pick<IndexableStore, "name" | "translations">;
}

/** Text safe inside a Markdown link's brackets, on one line. */
function linkText(text: string) {
  return text
    .replaceAll(/\s+/gu, " ")
    .trim()
    .replaceAll(/([\\[\]])/gu, "\\$1");
}

function section(title: string, lines: string[]) {
  return lines.length > 0 ? [`## ${title}`, "", ...lines, ""] : [];
}

/**
 * The store's `llms.txt` (llmstxt.org) in `locale`: the store's name as the
 * one H1, its tagline as the blockquote summary, its description, then
 * links to its categories' and groups' pages (FER-043) and to every published article with its price.
 * Generated from the same rows as the pages, so it never drifts from them.
 */
export function buildStoreLlms({
  articles,
  categories,
  copy,
  currencyCode,
  locale,
  origin,
  store,
}: StoreLlmsInput): string {
  const url = (path: string) => absoluteUrl(path, origin);
  const texts = pickTranslation(store.translations, locale);
  const tagline = texts?.tagline.replaceAll(/\s+/gu, " ").trim() ?? "";
  const description = texts?.description.trim() ?? "";
  const otherLocale: Locale = locale === "es" ? "en" : "es";

  return [
    `# ${store.name}`,
    "",
    ...(tagline === "" ? [] : [`> ${tagline}`, ""]),
    ...(description === "" ? [] : [description, ""]),
    ...section(
      copy.categories,
      categories.map(
        (entry) =>
          `- [${linkText(entry.name)}](${url(localizePath(entry.path, locale))})`
      )
    ),
    ...section(
      copy.articles,
      articles.map((article) => {
        const title = pickTranslation(article.titles, locale)?.title ?? "";
        const link = `- [${linkText(title)}](${url(
          localizePath(`/products/${article.slug}`, locale)
        )})`;

        return article.priceAmount === null
          ? link
          : `${link}: ${formatPrice(article.priceAmount, currencyCode, locale)}`;
      })
    ),
    ...section("Optional", [
      `- [${copy.catalog}](${url(catalogHref(locale, EMPTY_CATALOG_QUERY))})`,
      `- [${copy.otherLanguage}](${url(
        localizePath("/llms.txt", otherLocale)
      )})`,
    ]),
  ].join("\n");
}
