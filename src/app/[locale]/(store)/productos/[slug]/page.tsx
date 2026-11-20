import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/app/_components/atoms/json-ld";
import { StoreArticle } from "@/app/_components/organisms/store-article";
import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { getDictionary } from "@/content";
import { ALL_ARTICLES_PATH, articlePath } from "@/lib/catalog/paths";
import { interpolate } from "@/lib/i18n/interpolate";
import { buildAlternates } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import { articleSearchTexts } from "@/lib/seo/article-metadata";
import { absoluteUrl } from "@/lib/seo/origin";
import {
  breadcrumbList,
  productWithOffer,
  STORE_LOGO_PATH,
  storeOrganization,
} from "@/lib/seo/structured-data";
import {
  readPublishedArticle,
  readRelatedArticles,
} from "@/server/cache/catalog";
import { readStore } from "@/server/cache/store";

import { StorePageFooter } from "../../store-page-footer";
import { shellOf } from "../../store-shell";
import { couldBeArticle } from "./article-address";

interface ArticlePageProps {
  params: Promise<{ locale: string; slug: string }>;
}

// Static output made on an article's first visit and kept: the response
// waits for the read, so a draft or a deleted article is a real 404
// (docs/agents/nextjs.md § Store pages). Its read is cached and every write a
// shopper would see drops it (`invalidateCatalogCache`).
export const ensureStatic = "navigation";

// The page waits on its article before anything is sent, by design.
export const instant = false;

/** A sample that can never be an article: an underscore never makes a slug. */
export function generateStaticParams() {
  return [{ slug: "__sample__" }];
}

/** The store and the article, or `null` when the article is missing. */
async function load(params: ArticlePageProps["params"]) {
  const locale = await readLocale(params);
  const { slug } = await params;

  if (!couldBeArticle(slug)) {
    return null;
  }

  const store = await readStore();

  if (!store) {
    return null;
  }

  const article = await readPublishedArticle(store, slug, locale);

  return article ? { article, locale, store } : null;
}

/**
 * The article's own title and description for search engines and chat
 * previews: its title and the start of its description
 * (`articleSearchTexts`); the canonical address and one per language.
 */
export async function generateMetadata({
  params,
}: ArticlePageProps): Promise<Metadata> {
  const found = await load(params);

  if (!found) {
    return {};
  }

  const { article, locale, store } = found;
  const { description, pageTitle, title } = articleSearchTexts(article, {
    name: store.name,
    tagline: pickTranslation(store.translations, locale)?.tagline,
  });

  const path = articlePath(article.slug);

  return {
    alternates: buildAlternates(path, locale),
    description,
    openGraph: {
      description,
      siteName: store.name,
      title,
      type: "website",
      url: localizePath(path, locale),
    },
    title: { absolute: pageTitle },
  };
}

/** An article of the store (FER-024). */
export default async function ArticlePage({ params }: ArticlePageProps) {
  const found = await load(params);

  if (!found) {
    notFound();
  }

  const { article, locale, store } = found;
  const { storefront } = getDictionary(locale);
  const related = await readRelatedArticles(store, article, locale);
  const home = absoluteUrl(localizePath("/", locale));
  const catalog = absoluteUrl(localizePath(ALL_ARTICLES_PATH, locale));
  const url = absoluteUrl(localizePath(articlePath(article.slug), locale));
  const whatsappHref = store.whatsappNumber
    ? `https://wa.me/${store.whatsappNumber.replaceAll(/\D/gu, "")}?text=${encodeURIComponent(
        interpolate(storefront.article.askWhatsappText, {
          title: article.title,
          url,
        })
      )}`
    : null;

  return (
    <StoreFrame
      copy={storefront.shell}
      locale={locale}
      {...await shellOf(store, locale)}
    >
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
              ...(article.category?.group
                ? [
                    {
                      name: article.category.group.name,
                      url: absoluteUrl(
                        localizePath(article.category.group.path, locale)
                      ),
                    },
                  ]
                : []),
              ...(article.category
                ? [
                    {
                      name: article.category.name,
                      url: absoluteUrl(
                        localizePath(article.category.path, locale)
                      ),
                    },
                  ]
                : []),
              { name: article.title, url },
            ]),
            storeOrganization({
              instagramUrl: store.instagramUrl,
              logoUrl: absoluteUrl(STORE_LOGO_PATH),
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
          whatsappHref={whatsappHref}
        />
      </main>
      <StorePageFooter locale={locale} store={store} />
    </StoreFrame>
  );
}
