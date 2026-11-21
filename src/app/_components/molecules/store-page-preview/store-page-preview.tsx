import { StoreAnnouncementBar } from "@/app/_components/atoms/store-announcement-bar";
import { StoreBanner } from "@/app/_components/molecules/store-banner";
import {
  type StorePageArticle,
  StorePageSections,
} from "@/app/_components/molecules/store-page-sections";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { pageHref } from "@/lib/page/content";
import type { PagePreview } from "@/lib/page/preview";
import { cn } from "@/lib/utils";

/** An article as the preview's cards show it: the catalog card's fields. */
export type StorePagePreviewArticle = StorePageArticle;

export interface StorePagePreviewProps {
  className?: string;
  content: PagePreview<StorePagePreviewArticle>;
  copy: Dictionary["storefront"];
  locale: Locale;
  /** The admin's words around the picture, which the storefront never says. */
  words: {
    /** "Y {count} más en la portada": the cover's other banners. */
    coverMore: string;
    /** Said when the page would show nothing. */
    empty: string;
  };
}

/**
 * A page as the storefront would show it (FER-020's preview, FER-058),
 * drawn by the storefront's own pieces on the store's white page: the
 * announcement bar, the cover's first banner (and how many more it moves
 * through), then the page's own sequence of blocks
 * (`molecules/store-page-sections`, FER-022), in order. A picture, not a page: nothing in it can be focused or
 * followed (`inert`), so the screen's own controls are the only ones, and
 * the carousels never move. Its cover keeps a banner's height between rows:
 * the home's is nearly a screen tall, which a preview in a card is not.
 */
function StorePagePreview({
  className,
  content,
  copy,
  locale,
  words,
}: StorePagePreviewProps) {
  const [first, ...more] = content.cover;
  const empty =
    content.announcement === null &&
    first === undefined &&
    content.sections.length === 0;

  return (
    <div
      className={cn(
        "isolate overflow-hidden bg-store-background text-store-foreground",
        className
      )}
      data-slot="store-page-preview"
      data-testid="store-page-preview"
      inert
    >
      {content.announcement ? (
        <StoreAnnouncementBar
          href={
            content.announcement.href === null
              ? null
              : pageHref(content.announcement.href, locale)
          }
          lang={content.announcement.lang}
          short={content.announcement.shortText}
        >
          {content.announcement.text}
        </StoreAnnouncementBar>
      ) : null}
      {first ? (
        <div data-testid="store-home-preview-cover">
          <StoreBanner
            headingLevel="h3"
            href={first.href === null ? null : pageHref(first.href, locale)}
            image={first.image}
            lang={first.lang}
            phoneImage={first.phoneImage}
            shopNow={first.ctaLabel ?? copy.banner.shopNow}
            shopNowLang={first.ctaLabel ? first.lang : undefined}
            title={first.title}
          />
          {more.length > 0 ? (
            <p className="px-4 py-2 text-xs text-store-muted md:px-7">
              {interpolate(words.coverMore, { count: String(more.length) })}
            </p>
          ) : null}
        </div>
      ) : null}
      <StorePageSections
        afterBanner={first !== undefined && more.length === 0}
        copy={copy}
        headingLevel="h3"
        locale={locale}
        sections={content.sections}
      />
      {empty ? (
        <p className="px-4 py-8 text-sm text-store-muted md:px-7">
          {words.empty}
        </p>
      ) : null}
    </div>
  );
}

export { StorePagePreview };
