import type { ReactNode } from "react";

import { StorePriceTag } from "@/app/_components/atoms/store-price-tag";
import { StoreBreadcrumb } from "@/app/_components/molecules/store-breadcrumb";
import {
  StoreGallery,
  type StoreGalleryImage,
} from "@/app/_components/molecules/store-gallery";
import type { Dictionary } from "@/content";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/utils/format";

/** What the top of an article's page shows of it. */
export interface StoreArticleMainData {
  /** Its category, under its group when it has one (FER-043). */
  category: {
    group: { name: string; path: string } | null;
    name: string;
    path: string;
  } | null;
  currencyCode: Currency;
  description: string;
  images: StoreGalleryImage[];
  isAvailable: boolean;
  /** The language its texts are in (Spanish when it has no English). */
  lang: string;
  priceAmount: number;
  title: string;
}

export interface StoreArticleMainProps {
  article: StoreArticleMainData;
  /** What follows the description: the purchase, a question by WhatsApp. */
  children?: ReactNode;
  className?: string;
  copy: Dictionary["storefront"];
  locale: Locale;
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
 * The top of an article's page (FER-024, FER-039): on a computer the trail,
 * the name, the price and the description in a column on the left, the
 * photos on the right; on a phone the photos first. What follows the
 * description comes from the page (`children`): `organisms/store-article`
 * puts the purchase there, the wizard's preview (FER-017) shows it as the
 * shopper will.
 */
function StoreArticleMain({
  article,
  children,
  className,
  copy,
  locale,
}: StoreArticleMainProps) {
  const catalog = localizePath(ALL_ARTICLES_PATH, locale);
  const inCategory = article.category
    ? localizePath(article.category.path, locale)
    : null;
  const group = article.category?.group ?? null;
  const paragraphs = paragraphsOf(article.description);

  return (
    <div
      className={cn(
        "grid lg:grid-cols-[27rem_minmax(0,1fr)] lg:items-start",
        className
      )}
      data-slot="store-article-main"
    >
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
        {children}
      </div>
    </div>
  );
}

export { StoreArticleMain };
