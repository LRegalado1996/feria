import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { StoreBadge } from "@/app/_components/atoms/store-badge";
import { StorePriceTag } from "@/app/_components/atoms/store-price-tag";
import { StoreAddToCartButton } from "@/app/_components/molecules/store-add-to-cart-button";
import { StoreArticleCard } from "@/app/_components/molecules/store-article-card";
import { StoreArticlePurchase } from "@/app/_components/molecules/store-article-purchase";
import {
  StoreGallery,
  type StoreGalleryImage,
} from "@/app/_components/molecules/store-gallery";
import { StoreShareButton } from "@/app/_components/molecules/store-share-button";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import type { Currency } from "@/lib/utils/format";

/** An article as its page shows it. */
export interface StoreArticleData {
  category: { name: string; slug: string } | null;
  currencyCode: Currency;
  description: string;
  id: number;
  images: StoreGalleryImage[];
  isAvailable: boolean;
  /** The language its texts are in (Spanish when it has no English). */
  lang: string;
  priceAmount: number;
  slug: string;
  title: string;
}

/** An article beside it, as a card shows it. */
export interface StoreRelatedArticle {
  cover: { alt: string; url: string } | null;
  currencyCode: Currency;
  id: number;
  isAvailable: boolean;
  lang: string;
  priceAmount: number;
  slug: string;
  title: string;
}

export interface StoreArticleProps {
  article: StoreArticleData;
  copy: Dictionary["storefront"];
  locale: Locale;
  related: StoreRelatedArticle[];
  store: { slug: string };
  /** The store's chat with the article pre-written, when it has WhatsApp. */
  whatsappHref: string | null;
}

const LINK_CLASS =
  "inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground";

/**
 * An article's page (FER-024): the way back, its photos, its name and
 * price, how many to add (or, sold out, why not), a question by WhatsApp,
 * the share button, its description and the articles beside it. All of it
 * is in the server's HTML, so a search engine or an assistant reads it
 * without running the script.
 */
function StoreArticle({
  article,
  copy,
  locale,
  related,
  store,
  whatsappHref,
}: StoreArticleProps) {
  const home = localizePath(`/${store.slug}`, locale);
  const catalog = localizePath(`/${store.slug}/products`, locale);
  const path = localizePath(`/${store.slug}/products/${article.slug}`, locale);
  const labels = { card: copy.articleCard, price: copy.price };

  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 text-store-foreground md:py-12"
      data-slot="store-article"
      data-testid="store-article"
    >
      <nav aria-label={copy.article.breadcrumb}>
        <ol className="flex flex-wrap items-center gap-x-2 text-sm">
          <li>
            <Link className={LINK_CLASS} href={home}>
              {copy.article.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link className={LINK_CLASS} href={catalog}>
              {copy.article.catalog}
            </Link>
          </li>
          {article.category ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  className={LINK_CLASS}
                  href={`${catalog}?category=${article.category.slug}`}
                >
                  {article.category.name}
                </Link>
              </li>
            </>
          ) : null}
        </ol>
      </nav>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <StoreGallery images={article.images} title={article.title} />
        <div className="flex flex-col gap-6">
          <h1
            className="font-display store-display-section leading-display tracking-display wrap-anywhere uppercase"
            lang={article.lang}
          >
            {article.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <StorePriceTag
              amount={article.priceAmount}
              currency={article.currencyCode}
              labels={copy.price}
              locale={locale}
              size="lg"
            />
            {article.isAvailable ? null : (
              <StoreBadge tone="contrast">
                {copy.article.unavailable}
              </StoreBadge>
            )}
          </div>
          {article.isAvailable ? (
            <StoreArticlePurchase
              productId={article.id}
              storeSlug={store.slug}
            />
          ) : (
            <p className="text-base">{copy.article.unavailableBody}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {whatsappHref ? (
              <a
                className="inline-flex min-h-11 items-center gap-2 border-2 border-store-contrast px-4 text-sm font-semibold hover:bg-store-contrast hover:text-store-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
                data-testid="store-article-whatsapp"
                href={whatsappHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MessageCircle aria-hidden="true" className="size-4" />
                {copy.article.askWhatsapp}
                <span className="sr-only"> {copy.shell.newTab}</span>
              </a>
            ) : null}
            <StoreShareButton path={path} title={article.title} />
          </div>
          {article.description ? (
            <p
              className="max-w-prose text-base whitespace-pre-line"
              lang={article.lang}
            >
              {article.description}
            </p>
          ) : null}
        </div>
      </div>
      {related.length > 0 ? (
        <section aria-labelledby="store-article-related">
          <h2
            className="mb-6 font-display text-3xl leading-display tracking-display uppercase"
            id="store-article-related"
          >
            {copy.article.related}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4">
            {related.map((item) => (
              <li key={item.id}>
                <StoreArticleCard
                  action={
                    item.isAvailable ? (
                      <StoreAddToCartButton
                        name={item.title}
                        productId={item.id}
                        storeSlug={store.slug}
                      />
                    ) : undefined
                  }
                  amount={item.priceAmount}
                  currency={item.currencyCode}
                  headingLevel="h3"
                  href={localizePath(
                    `/${store.slug}/products/${item.slug}`,
                    locale
                  )}
                  image={
                    item.cover
                      ? { alt: item.cover.alt, src: item.cover.url }
                      : null
                  }
                  labels={labels}
                  locale={locale}
                  name={item.title}
                  nameLang={item.lang}
                  unavailable={!item.isAvailable}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export { StoreArticle };
