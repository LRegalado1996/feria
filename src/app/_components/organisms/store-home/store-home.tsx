import { StoreCoverCarousel } from "@/app/_components/molecules/store-cover-carousel";
import {
  type StorePageArticle,
  StorePageSections,
} from "@/app/_components/molecules/store-page-sections";
import {
  StoreIntro,
  type StoreIntroProps,
} from "@/app/_components/organisms/store-intro";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { isOffer, type PageContent, pageHref } from "@/lib/page/content";

export interface StoreHomeProps {
  /** The way into the catalog, for a home with nothing else to show. */
  browse: StoreIntroProps["browse"];
  /** What the home shows now (FER-020's read), already filtered. */
  content: Pick<PageContent<StorePageArticle>, "cover" | "sections">;
  copy: Dictionary["storefront"];
  locale: Locale;
  /** The store's name: the page's `h1`. */
  name: string;
  /** The store's tagline and description, for a home with nothing else. */
  text: StoreIntroProps["text"];
}

/**
 * The storefront's home (FER-022), top to bottom: the cover, a carousel of
 * the cover's banners attached to the header and nearly a screen tall
 * (one banner shows still), then the rows of articles and the banners
 * between them in the order the admin set (FER-020). Each part shows only
 * with something in it: with no cover the home opens on its first row.
 *
 * The page's `h1` is the store's name, visually hidden: the cover is
 * attached to the header, whose logo already shows the name, and a cover's
 * title is a passing promotion that rotates, is a link's text and changes
 * with the season, which the page's one heading should not. A screen reader
 * and a crawler read the name first, then each banner and row as an `h2`.
 *
 * A store with nothing to show yet (no banner, no article published; a
 * "how to buy" block alone does not count, FER-076)
 * introduces itself instead (`organisms/store-intro`): its name as a
 * visible `h1`, its tagline, its description and the way into its catalog,
 * so a new store never opens on a blank page.
 */
function StoreHome({
  browse,
  content,
  copy,
  locale,
  name,
  text,
}: StoreHomeProps) {
  const hasCover = content.cover.length > 0;

  // "How to buy" alone is nothing to buy: the store introduces itself.
  if (!(hasCover || content.sections.some(isOffer))) {
    return (
      <div
        data-kind="intro"
        data-slot="store-home"
        data-testid="store-home-view"
      >
        <StoreIntro browse={browse} name={name} text={text} />
      </div>
    );
  }

  return (
    <div
      className="pb-2.5 md:pb-3.5"
      data-kind="sections"
      data-slot="store-home"
      data-testid="store-home-view"
    >
      <h1 className="sr-only">{name}</h1>
      {hasCover ? (
        <div data-testid="store-home-cover">
          <StoreCoverCarousel
            banners={content.cover.map((banner) => ({
              href: banner.href === null ? null : pageHref(banner.href, locale),
              id: String(banner.id),
              image: banner.image,
              lang: banner.lang,
              phoneImage: banner.phoneImage,
              shopNow: banner.ctaLabel,
              title: banner.title,
            }))}
            headingLevel="h2"
          />
        </div>
      ) : null}
      <StorePageSections
        afterBanner={hasCover}
        copy={copy}
        leading={!hasCover}
        locale={locale}
        reveal
        sections={content.sections}
      />
    </div>
  );
}

export { StoreHome };
