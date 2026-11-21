import { StoreCoverCarousel } from "@/app/_components/molecules/store-cover-carousel";
import {
  type StorePageArticle,
  StorePageSections,
} from "@/app/_components/molecules/store-page-sections";
import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { type PageContent, pageHref } from "@/lib/page/content";
import { cn } from "@/lib/utils";

export interface StorePageProps {
  /** What the page shows now (`readPageContent`), already filtered. */
  content: PageContent<StorePageArticle>;
  copy: Dictionary["storefront"];
  /**
   * A draft a signed-in admin previews (FER-060): a line above it says the
   * public does not see it.
   */
  draft?: boolean;
  locale: Locale;
  /** The page's name: its `h1`. */
  name: string;
  /** The language of its name, which may differ from the page's. */
  nameLang?: string;
}

/**
 * A page of the store built from sections (FER-060), as the home is: its
 * cover, a carousel of its banners attached to the header, then its blocks
 * in the order the admin set. Its name is the page's one `h1`: visually
 * hidden under a cover, as the home's (the cover's titles say what it is
 * about), and visible, centered like a catalog page's title, when the page
 * opens on its blocks. A page with nothing to show still says its name and
 * that it shows nothing yet.
 */
function StorePage({
  content,
  copy,
  draft = false,
  locale,
  name,
  nameLang,
}: StorePageProps) {
  const hasCover = content.cover.length > 0;

  return (
    <div
      className="pb-2.5 md:pb-3.5"
      data-cover={hasCover}
      data-slot="store-page"
      data-testid="store-page-view"
    >
      {draft ? (
        <p
          className="bg-store-accent px-4 py-2 text-center text-sm text-store-foreground"
          data-testid="store-page-draft"
          role="note"
        >
          {copy.page.draft}
        </p>
      ) : null}
      <h1
        className={cn(
          hasCover
            ? "sr-only"
            : "px-4 pt-10 pb-6 text-center font-display store-display-page leading-display font-extrabold wrap-anywhere uppercase md:pt-14 md:pb-8"
        )}
        lang={nameLang}
      >
        {name}
      </h1>
      {hasCover ? (
        <div data-testid="store-page-cover">
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
      {!hasCover && content.sections.length === 0 ? (
        <p className="px-4 pb-16 text-center text-store-muted">
          {copy.page.empty}
        </p>
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

export { StorePage };
