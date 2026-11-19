import { StoreAnnouncementBar } from "@/app/_components/atoms/store-announcement-bar";
import {
  STORE_CARD_SIZES,
  StoreArticleCard,
} from "@/app/_components/molecules/store-article-card";
import { StoreArticleRow } from "@/app/_components/molecules/store-article-row";
import { StoreBanner } from "@/app/_components/molecules/store-banner";
import type { Dictionary } from "@/content";
import { articlePath } from "@/lib/catalog/paths";
import {
  type HomeBanner,
  type HomeContent,
  type HomeContentSection,
  type HomeRow,
  homeHref,
} from "@/lib/home/content";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/utils/format";

/** An article as the preview's cards show it: the catalog card's fields. */
export interface StoreHomePreviewArticle {
  cover: { alt: string; height: number; url: string; width: number } | null;
  currencyCode: Currency;
  id: number;
  isAvailable: boolean;
  lang: string;
  priceAmount: number;
  slug: string;
  title: string;
}

export interface StoreHomePreviewProps {
  className?: string;
  content: HomeContent<StoreHomePreviewArticle>;
  copy: Dictionary["storefront"];
  locale: Locale;
  /** The admin's words around the picture, which the storefront never says. */
  words: {
    /** "Y {count} más en la portada": the cover's other banners. */
    coverMore: string;
    /** Said when the home would show nothing. */
    empty: string;
  };
}

/** A banner as the storefront draws it, its words in its own language. */
function PreviewBanner({
  banner,
  copy,
  locale,
}: {
  banner: HomeBanner;
  copy: Dictionary["storefront"];
  locale: Locale;
}) {
  return (
    <div lang={banner.lang}>
      <StoreBanner
        href={banner.href === null ? null : homeHref(banner.href, locale)}
        shopNow={banner.ctaLabel ?? copy.banner.shopNow}
        src={banner.image.url}
        title={banner.title}
      />
    </div>
  );
}

/** A row's heading: its category's name, or the curated row's own. */
function rowTitle(
  section: HomeRow<StoreHomePreviewArticle>,
  copy: Dictionary["storefront"]
): string {
  if (section.kind === "category") {
    return section.category.name;
  }

  return section.kind === "best_sellers"
    ? copy.home.bestSellers
    : copy.home.featured;
}

/** One place of the sequence: a row of cards, or a banner. */
function PreviewSection({
  copy,
  locale,
  section,
}: {
  copy: Dictionary["storefront"];
  locale: Locale;
  section: HomeContentSection<StoreHomePreviewArticle>;
}) {
  if (section.kind === "banner") {
    return (
      <PreviewBanner banner={section.banner} copy={copy} locale={locale} />
    );
  }

  return (
    <StoreArticleRow
      headingLevel="h3"
      items={section.articles.map((article) => ({
        content: (
          <StoreArticleCard
            amount={article.priceAmount}
            currency={article.currencyCode}
            href={localizePath(articlePath(article.slug), locale)}
            image={
              article.cover
                ? { alt: article.cover.alt, src: article.cover.url }
                : null
            }
            labels={{ card: copy.articleCard, price: copy.price }}
            locale={locale}
            name={article.title}
            nameLang={article.lang}
            sizes={STORE_CARD_SIZES.row}
            unavailable={!article.isAvailable}
          />
        ),
        id: String(article.id),
      }))}
      title={rowTitle(section, copy)}
      viewAllHref={
        section.kind === "category"
          ? localizePath(section.category.path, locale)
          : undefined
      }
    />
  );
}

/**
 * The home as the storefront would show it (FER-020's preview), drawn by
 * the storefront's own pieces on the store's white page: the announcement
 * bar, the cover's first banner (and how many more it moves through), then
 * the rows of cards and the banners between them, in order. A picture, not
 * a page: nothing in it can be focused or followed (`inert`), so the
 * screen's own controls are the only ones, and the carousels never move.
 */
function StoreHomePreview({
  className,
  content,
  copy,
  locale,
  words,
}: StoreHomePreviewProps) {
  const [first, ...more] = content.cover;
  const empty =
    content.announcement === null &&
    first === undefined &&
    content.sections.length === 0;

  return (
    <div
      className={cn(
        "overflow-hidden bg-store-background text-store-foreground",
        className
      )}
      data-slot="store-home-preview"
      data-testid="store-home-preview"
      inert
    >
      {content.announcement ? (
        <StoreAnnouncementBar
          href={
            content.announcement.href === null
              ? null
              : homeHref(content.announcement.href, locale)
          }
          lang={content.announcement.lang}
          short={content.announcement.shortText}
        >
          {content.announcement.text}
        </StoreAnnouncementBar>
      ) : null}
      {first ? (
        <div data-testid="store-home-preview-cover">
          <PreviewBanner banner={first} copy={copy} locale={locale} />
          {more.length > 0 ? (
            <p className="px-4 py-2 text-xs text-store-muted md:px-7">
              {interpolate(words.coverMore, { count: String(more.length) })}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-10 py-8">
        {content.sections.map((section) => (
          // A banner is the page's whole width; a row keeps the margins.
          <div
            className={section.kind === "banner" ? undefined : "px-4 md:px-7"}
            key={section.key}
          >
            <PreviewSection copy={copy} locale={locale} section={section} />
          </div>
        ))}
        {empty ? (
          <p className="px-4 text-sm text-store-muted md:px-7">{words.empty}</p>
        ) : null}
      </div>
    </div>
  );
}

export { StoreHomePreview };
