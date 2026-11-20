import { StoreReveal } from "@/app/_components/atoms/store-reveal";
import {
  STORE_CARD_SIZES,
  StoreArticleCard,
} from "@/app/_components/molecules/store-article-card";
import { StoreArticleRow } from "@/app/_components/molecules/store-article-row";
import { StoreBanner } from "@/app/_components/molecules/store-banner";
import type { Dictionary } from "@/content";
import { articlePath } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import {
  type PageContentSection,
  type PageRow,
  pageHref,
} from "@/lib/page/content";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/utils/format";

/** An article as a home row's card shows it: the catalog card's fields. */
export interface StorePageArticle {
  cover: { alt: string; height: number; url: string; width: number } | null;
  currencyCode: Currency;
  id: number;
  isAvailable: boolean;
  /** The language of its title, which may differ from the page's. */
  lang: string;
  priceAmount: number;
  slug: string;
  title: string;
}

export interface StorePageSectionsProps {
  /** A banner sits right above the first section (the home's cover). */
  afterBanner?: boolean;
  className?: string;
  copy: Dictionary["storefront"];
  /** The level the rows' and banners' headings take in the page's outline. */
  headingLevel?: "h2" | "h3";
  /**
   * The first section opens the page (a home with no cover): a banner there
   * is the page's priority image.
   */
  leading?: boolean;
  locale: Locale;
  /**
   * Each section rises into place as it scrolls into view (the storefront's
   * home); off for a picture that never scrolls on its own (the preview).
   */
  reveal?: boolean;
  sections: readonly PageContentSection<StorePageArticle>[];
}

/** A row's heading: its category's name, or the curated row's own. */
function rowTitle(
  section: PageRow<StorePageArticle>,
  copy: Dictionary["storefront"]
): string {
  if (section.kind === "category") {
    return section.category.name;
  }

  return section.kind === "best_sellers"
    ? copy.home.bestSellers
    : copy.home.featured;
}

/**
 * A row of the home: its heading, "Ver todo" for a category, which leads to
 * its page, and the catalog's cards. A curated row ("Más vendidos",
 * "Destacados") already shows every article it holds, so it has no "Ver
 * todo": the whole catalog under its name would promise what it is not.
 */
function HomeArticleRow({
  copy,
  headingLevel,
  locale,
  section,
}: {
  copy: Dictionary["storefront"];
  headingLevel: "h2" | "h3";
  locale: Locale;
  section: PageRow<StorePageArticle>;
}) {
  const labels = { card: copy.articleCard, price: copy.price };

  return (
    <StoreArticleRow
      headingLevel={headingLevel}
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
            labels={labels}
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
      titleLang={
        section.kind === "category" ? section.category.lang : undefined
      }
      viewAllHref={
        section.kind === "category"
          ? localizePath(section.category.path, locale)
          : undefined
      }
    />
  );
}

/**
 * The home's sequence under the cover (FER-022), in the order the admin set
 * (FER-020): rows of the catalog's cards and photo banners the width of the
 * window between them. The storefront's home and the admin's preview both
 * draw it here, so the preview is the home. A banner directly under another
 * one (or under the cover) keeps a gutter from it, the cards' own, so two
 * photos never fuse; rows keep their own padding.
 */
function StorePageSections({
  afterBanner = false,
  className,
  copy,
  headingLevel = "h2",
  leading = false,
  locale,
  reveal = false,
  sections,
}: StorePageSectionsProps) {
  const Section = reveal ? StoreReveal : "div";

  return (
    <div
      className={cn("flex flex-col", className)}
      data-slot="store-page-sections"
    >
      {sections.map((section, index) => {
        const underBanner =
          index === 0 ? afterBanner : sections[index - 1]?.kind === "banner";

        return (
          <Section
            className={cn(
              section.kind === "banner" && underBanner && "mt-2.5 md:mt-3.5"
            )}
            data-kind={section.kind}
            data-testid="store-page-section"
            key={section.key}
          >
            {section.kind === "banner" ? (
              <StoreBanner
                headingLevel={headingLevel}
                href={
                  section.banner.href === null
                    ? null
                    : pageHref(section.banner.href, locale)
                }
                image={section.banner.image}
                lang={section.banner.lang}
                phoneImage={section.banner.phoneImage}
                priority={leading && index === 0}
                shopNow={section.banner.ctaLabel ?? copy.banner.shopNow}
                shopNowLang={
                  section.banner.ctaLabel ? section.banner.lang : undefined
                }
                title={section.banner.title}
              />
            ) : (
              <HomeArticleRow
                copy={copy}
                headingLevel={headingLevel}
                locale={locale}
                section={section}
              />
            )}
          </Section>
        );
      })}
    </div>
  );
}

export { StorePageSections };
