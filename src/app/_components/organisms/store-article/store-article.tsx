import { MessageCircle } from "lucide-react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StorePriceTag } from "@/app/_components/atoms/store-price-tag";
import { StoreArticleBand } from "@/app/_components/molecules/store-article-band";
import {
  STORE_CARD_SIZES,
  StoreArticleCard,
} from "@/app/_components/molecules/store-article-card";
import { StoreArticlePurchase } from "@/app/_components/molecules/store-article-purchase";
import { StoreBreadcrumb } from "@/app/_components/molecules/store-breadcrumb";
import {
  StoreGallery,
  type StoreGalleryImage,
} from "@/app/_components/molecules/store-gallery";
import { StoreRelatedRow } from "@/app/_components/molecules/store-related-row";
import type { Dictionary } from "@/content";
import { ALL_ARTICLES_PATH, articlePath } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import type { Currency } from "@/lib/utils/format";

/** An article as its page shows it. */
export interface StoreArticleData {
  /** Its category, under its group when it has one (FER-043). */
  category: {
    group: { name: string; path: string } | null;
    name: string;
    path: string;
    slug: string;
  } | null;
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
  /**
   * What "También te puede gustar" picks from: the article's category, and
   * the rest of the store when the category is small (FER-039).
   */
  related: {
    others: readonly StoreRelatedArticle[];
    same: readonly StoreRelatedArticle[];
  };
  /** The store's chat with the article pre-written, when it has WhatsApp. */
  whatsappHref: string | null;
}

/**
 * A description's paragraphs: split on blank lines, each trimmed, none
 * empty, keyed by their words and how often those came before.
 */
function paragraphsOf(description: string): { key: string; text: string }[] {
  const seen = new Map<string, number>();

  return description
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .map((text) => {
      const count = seen.get(text) ?? 0;
      seen.set(text, count + 1);

      return { key: `${count}:${text}`, text };
    });
}

/**
 * An article's page (FER-024, FER-039). On a computer its name, price,
 * description, quantity and "Agregar al carrito" sit in a column on the
 * left while its photos scroll sideways on the right; on a phone the photos
 * come first. Then a question by WhatsApp, a festive moss band, and the
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
  const catalog = localizePath(ALL_ARTICLES_PATH, locale);
  const inCategory = article.category
    ? localizePath(article.category.path, locale)
    : null;
  const group = article.category?.group ?? null;
  const labels = { card: copy.articleCard, price: copy.price };
  const paragraphs = paragraphsOf(article.description);
  const relatedCard = (item: StoreRelatedArticle) => ({
    content: (
      <StoreArticleCard
        amount={item.priceAmount}
        currency={item.currencyCode}
        headingLevel="h3"
        href={localizePath(articlePath(item.slug), locale)}
        image={item.cover ? { alt: item.cover.alt, src: item.cover.url } : null}
        labels={labels}
        locale={locale}
        name={item.title}
        nameLang={item.lang}
        // The browser may swap the cards once it draws its own pick: two
        // lines each keep the row's height.
        nameLines="two"
        sizes={STORE_CARD_SIZES.row}
        unavailable={!item.isAvailable}
      />
    ),
    id: String(item.id),
  });

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
          {/* The catalog pages' trail (FER-044): the home a house, then the
              catalog, the group and the category, and the article itself,
              as the structured data lists them. */}
          <StoreBreadcrumb
            items={[
              { href: localizePath("/", locale), name: copy.article.home },
              { href: catalog, name: copy.article.catalog },
              ...(group
                ? [{ href: localizePath(group.path, locale), name: group.name }]
                : []),
              ...(article.category && inCategory
                ? [{ href: inCategory, name: article.category.name }]
                : []),
              { lang: article.lang, name: article.title },
            ]}
            label={copy.article.breadcrumb}
          />
          <h1
            className="mt-3 font-display store-display-article leading-display font-extrabold wrap-anywhere uppercase lg:mt-5"
            lang={article.lang}
          >
            {article.title}
          </h1>
          {article.isAvailable ? (
            <StorePriceTag
              amount={article.priceAmount}
              className="mt-1.5"
              currency={article.currencyCode}
              labels={copy.price}
              locale={locale}
              size="lg"
            />
          ) : (
            <p className="mt-1.5 text-xl text-store-muted">
              {copy.article.unavailable}
            </p>
          )}
          {paragraphs.length > 0 ? (
            // The whole description, its paragraphs kept: a blank line
            // starts a new one, a single line break stays inside it.
            <div
              className="mt-4 flex max-w-prose flex-col gap-3 text-base text-store-foreground"
              data-testid="store-article-description"
              lang={article.lang}
            >
              {paragraphs.map((paragraph) => (
                <p className="whitespace-pre-line" key={paragraph.key}>
                  {paragraph.text}
                </p>
              ))}
            </div>
          ) : null}
          {article.isAvailable ? (
            <StoreArticlePurchase
              className="mt-6"
              priceAmount={article.priceAmount}
              productId={article.id}
              title={article.title}
            />
          ) : (
            <p className="mt-6.5 text-base">{copy.article.unavailableBody}</p>
          )}
          {whatsappHref ? (
            <StoreButton asChild className="mt-5 self-start" variant="outline">
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
        </div>
      </div>
      <StoreArticleBand
        greeting={copy.article.bandGreeting}
        pauseLabel={copy.article.bandPause}
      />
      <StoreRelatedRow
        others={related.others.map(relatedCard)}
        same={related.same.map(relatedCard)}
        title={copy.article.related}
        viewAllHref={inCategory ?? catalog}
      />
    </div>
  );
}

export { StoreArticle };
