import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StorePriceTag } from "@/app/_components/atoms/store-price-tag";
import { StoreAddToCartButton } from "@/app/_components/molecules/store-add-to-cart-button";
import {
  STORE_CARD_SIZES,
  StoreArticleCard,
} from "@/app/_components/molecules/store-article-card";
import { StoreArticlePurchase } from "@/app/_components/molecules/store-article-purchase";
import { StoreArticleRow } from "@/app/_components/molecules/store-article-row";
import {
  StoreGallery,
  type StoreGalleryImage,
} from "@/app/_components/molecules/store-gallery";
import { StoreShareButton } from "@/app/_components/molecules/store-share-button";
import type { Dictionary } from "@/content";
import { catalogHref, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
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
  /** The store's chat with the article pre-written, when it has WhatsApp. */
  whatsappHref: string | null;
}

const CRUMB_CLASS =
  "inline-flex min-h-11 items-center underline underline-offset-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground";

/**
 * An article's page (FER-024, FER-039). On a computer its name, price,
 * description, quantity and "Agregar al carrito" sit in a column on the
 * left while its photos scroll sideways on the right; on a phone the photos
 * come first. Then a question by WhatsApp, the share button, and the
 * articles beside it in a row. All of it is in the server's HTML, so a
 * search engine or an assistant reads it without running the script.
 */
function StoreArticle({
  article,
  copy,
  locale,
  related,
  whatsappHref,
}: StoreArticleProps) {
  const catalog = localizePath("/products", locale);
  const inCategory = article.category
    ? catalogHref(locale, {
        ...EMPTY_CATALOG_QUERY,
        category: article.category.slug,
      })
    : null;
  const path = localizePath(`/products/${article.slug}`, locale);
  const labels = { card: copy.articleCard, price: copy.price };

  return (
    <div
      className="flex flex-col text-store-foreground"
      data-slot="store-article"
      data-testid="store-article"
    >
      <div className="grid lg:grid-cols-[27rem_minmax(0,1fr)] lg:items-start">
        <StoreGallery
          className="lg:order-last"
          images={article.images}
          title={article.title}
        />
        <div className="flex flex-col px-4 pt-5 pb-8 lg:pt-9 lg:pr-10 lg:pb-12 lg:pl-7">
          <nav aria-label={copy.article.breadcrumb}>
            <ol className="flex flex-wrap items-center gap-x-2 text-sm text-store-muted">
              <li>
                <Link className={CRUMB_CLASS} href={catalog}>
                  {copy.article.catalog}
                </Link>
              </li>
              {article.category && inCategory ? (
                <>
                  <li aria-hidden="true">/</li>
                  <li>
                    <Link className={CRUMB_CLASS} href={inCategory}>
                      {article.category.name}
                    </Link>
                  </li>
                </>
              ) : null}
            </ol>
          </nav>
          <h1
            className="mt-3 font-display store-display-article leading-display font-extrabold wrap-anywhere uppercase lg:mt-5"
            lang={article.lang}
          >
            {article.title}
          </h1>
          {article.isAvailable ? (
            <StorePriceTag
              amount={article.priceAmount}
              className="mt-3.5"
              currency={article.currencyCode}
              labels={copy.price}
              locale={locale}
              size="lg"
            />
          ) : (
            <p className="mt-3.5 text-xl text-store-muted">
              {copy.article.unavailable}
            </p>
          )}
          {article.description ? (
            <p
              className="mt-4.5 max-w-prose text-base whitespace-pre-line text-store-foreground"
              lang={article.lang}
            >
              {article.description}
            </p>
          ) : null}
          {article.isAvailable ? (
            <StoreArticlePurchase
              className="mt-6.5"
              priceAmount={article.priceAmount}
              productId={article.id}
            />
          ) : (
            <p className="mt-6.5 text-base">{copy.article.unavailableBody}</p>
          )}
          <div className="mt-5 flex flex-wrap items-start gap-2.5">
            {whatsappHref ? (
              <StoreButton asChild variant="outline">
                <a
                  data-testid="store-article-whatsapp"
                  href={whatsappHref}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <MessageCircle aria-hidden="true" />
                  {copy.article.askWhatsapp}
                  <span className="sr-only"> {copy.shell.newTab}</span>
                </a>
              </StoreButton>
            ) : null}
            <StoreShareButton path={path} title={article.title} />
          </div>
        </div>
      </div>
      {related.length > 0 ? (
        <StoreArticleRow
          items={related.map((item) => ({
            content: (
              <StoreArticleCard
                action={
                  item.isAvailable ? (
                    <StoreAddToCartButton
                      name={item.title}
                      priceAmount={item.priceAmount}
                      productId={item.id}
                    />
                  ) : undefined
                }
                amount={item.priceAmount}
                currency={item.currencyCode}
                headingLevel="h3"
                href={localizePath(`/products/${item.slug}`, locale)}
                image={
                  item.cover
                    ? { alt: item.cover.alt, src: item.cover.url }
                    : null
                }
                labels={labels}
                locale={locale}
                name={item.title}
                nameLang={item.lang}
                sizes={STORE_CARD_SIZES.row}
                unavailable={!item.isAvailable}
              />
            ),
            id: String(item.id),
          }))}
          title={copy.article.related}
          viewAllHref={inCategory ?? catalog}
        />
      ) : null}
    </div>
  );
}

export { StoreArticle };
