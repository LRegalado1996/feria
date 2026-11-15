import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/app/_components/atoms/json-ld";
import { StoreArticle } from "@/app/_components/organisms/store-article";
import { getDictionary } from "@/content";
import { interpolate } from "@/lib/i18n/interpolate";
import { buildAlternates } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import { absoluteUrl } from "@/lib/seo/origin";
import {
  breadcrumbList,
  productWithOffer,
  storeOrganization,
} from "@/lib/seo/structured-data";
import {
  readPublishedArticle,
  readRelatedArticles,
} from "@/server/cache/catalog";
import { getStoreForPath } from "@/server/cache/store";

interface ArticlePageProps {
  params: Promise<{ locale: string; slug: string; store: string }>;
}

/** What a search result shows under the title, at most this long. */
const DESCRIPTION_MAX = 160;

// Static output made on an article's first visit and kept, like the store's
// home: the response waits for the read, so a draft or a deleted article is a
// real 404 (docs/agents/nextjs.md § Store pages). Its read is cached and every
// write a shopper would see drops it (`invalidateCatalogCache`).
export const ensureStatic = "navigation";

// The page waits on its article before anything is sent, by design.
export const instant = false;

/** A sample that can never be an article: an underscore never makes a slug. */
export function generateStaticParams() {
  return [{ slug: "__sample__" }];
}

/** The store and the article, or `null` when either is missing. */
async function load(params: ArticlePageProps["params"]) {
  const locale = await readLocale(params);
  const { slug, store: segment } = await params;
  const store = await getStoreForPath(segment);

  if (!store) {
    return null;
  }

  const article = await readPublishedArticle(store, slug, locale);

  return article ? { article, locale, store } : null;
}

/** `text` cut at a word to fit a search result, with an ellipsis. */
function excerpt(text: string): string {
  const flat = text.replaceAll(/\s+/gu, " ").trim();

  if (flat.length <= DESCRIPTION_MAX) {
    return flat;
  }

  const cut = flat.slice(0, DESCRIPTION_MAX - 1);
  const space = cut.lastIndexOf(" ");

  return `${space > 0 ? cut.slice(0, space) : cut}…`;
}

/**
 * The article's own title and description for search engines and chat
 * previews: its SEO fields, else its title and the start of its
 * description; the canonical address and one per language.
 */
export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const found = await load(params);

  if (!found) {
    return {};
  }

  const { article, locale, store } = found;
  const title = article.seoTitle ?? article.title;
  const description =
    article.seoDescription ??
    (article.description
      ? excerpt(article.description)
      : pickTranslation(store.translations, locale)?.tagline);

  const path = `/${store.slug}/products/${article.slug}`;

  return {
    alternates: buildAlternates(path, locale),
    description,
    // The whole object replaces the store layout's, so the store's name is
    // said again here.
    openGraph: {
      description,
      siteName: store.name,
      title,
      type: "website",
      url: localizePath(path, locale),
    },
    title,
  };
}

/** An article of a store (FER-024). */
export default async function ArticlePage({ params }: ArticlePageProps) {
  const found = await load(params);

  if (!found) {
    notFound();
  }

  const { article, locale, store } = found;
  const { storefront } = getDictionary(locale);
  const related = await readRelatedArticles(store, article, locale);
  const home = absoluteUrl(localizePath(`/${store.slug}`, locale));
  const catalog = absoluteUrl(localizePath(`/${store.slug}/products`, locale));
  const url = absoluteUrl(
    localizePath(`/${store.slug}/products/${article.slug}`, locale)
  );
  const whatsappHref = store.whatsappNumber
    ? `https://wa.me/${store.whatsappNumber.replaceAll(/\D/gu, "")}?text=${encodeURIComponent(
        interpolate(storefront.article.askWhatsappText, {
          title: article.title,
          url,
        })
      )}`
    : null;

  return (
    <main>
      <JsonLd
        data={[
          productWithOffer({
            category: article.category?.name ?? null,
            currency: article.currencyCode,
            description: article.description,
            images: article.images.map((image) => absoluteUrl(image.url)),
            isAvailable: article.isAvailable,
            name: article.title,
            priceAmount: article.priceAmount,
            sku: article.slug,
            storeName: store.name,
            url,
          }),
          breadcrumbList([
            { name: store.name, url: home },
            { name: storefront.article.catalog, url: catalog },
            ...(article.category
              ? [
                  {
                    name: article.category.name,
                    url: `${catalog}?category=${article.category.slug}`,
                  },
                ]
              : []),
            { name: article.title, url },
          ]),
          storeOrganization({
            instagramUrl: store.instagramUrl,
            logoUrl: store.logoUrl,
            name: store.name,
            tiktokUrl: store.tiktokUrl,
            url: home,
          }),
        ]}
      />
      <StoreArticle
        article={article}
        copy={storefront}
        locale={locale}
        related={related}
        store={store}
        whatsappHref={whatsappHref}
      />
    </main>
  );
}
