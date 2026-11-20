import type { PageCurationData } from "@/lib/hooks/page";
import type { Locale } from "@/lib/i18n/config";
import type {
  SaveAnnouncementValues,
  SavePageLayoutValues,
} from "@/lib/schemas/page";
import type { Currency } from "@/lib/utils/format";

import {
  composePageSections,
  PAGE_CATEGORY_ROW_MAX,
  type ShownAnnouncement,
  type PageBanner,
  type PageContent,
  type PageWords,
} from "./content";
import { resolvePageSections } from "./layout";
import { isShowing } from "./schedule";

/** An article as the preview's cards show it: the catalog card's fields. */
export interface PagePreviewArticle {
  cover: { alt: string; height: number; url: string; width: number } | null;
  currencyCode: Currency;
  id: number;
  isAvailable: boolean;
  lang: Locale;
  priceAmount: number;
  slug: string;
  title: string;
}

/**
 * A page as the preview draws it: its cover and blocks, and the store's
 * announcement bar above, which every page's frame shows.
 */
export type PagePreview<Article> = PageContent<Article> & {
  announcement: ShownAnnouncement | null;
};

/** What the admin has typed and ordered, before it is saved. */
export interface PagePreviewDrafts {
  /** The announcement form's values once they read, else `null`. */
  announcement: SaveAnnouncementValues | null;
  layout: SavePageLayoutValues;
}

/** A text in `locale`, else the Spanish one, with the language it is in. */
function inLocale(
  texts: { en: string | null; es: string },
  locale: Locale
): { lang: Locale; text: string } {
  return locale === "en" && texts.en !== null
    ? { lang: "en", text: texts.en }
    : { lang: "es", text: texts.es };
}

/**
 * An optional word in `locale`, else in the other language, with the one
 * it is in; `null` when neither has it. As the storefront's read picks a
 * spotlight's label and phrase.
 */
function wordIn(
  texts: { en: string | null; es: string | null },
  locale: Locale
): PageWords | null {
  const other: Locale = locale === "en" ? "es" : "en";

  for (const lang of [locale, other]) {
    const text = texts[lang];

    if (text !== null) {
      return { lang, text };
    }
  }

  return null;
}

/** The announcement's words in `locale`, as the storefront's read gives them. */
function previewAnnouncement(
  announcement: SaveAnnouncementValues,
  locale: Locale
): ShownAnnouncement {
  const { lang, text } = inLocale(
    { en: announcement.textEn, es: announcement.textEs },
    locale
  );

  return {
    href: announcement.linkUrl,
    lang,
    shortText:
      lang === "en" ? announcement.shortTextEn : announcement.shortTextEs,
    text,
  };
}

/**
 * The page the storefront would show with the admin's drafts (FER-020's
 * preview, FER-058), on the business day the data was read, in `locale`:
 * the same rules as the storefront's read (`getPageContent`), applied in
 * the browser to what the screen holds. A draft that does not read (a field
 * left wrong) shows no announcement until it does.
 */
export function previewPageContent(
  data: PageCurationData,
  drafts: PagePreviewDrafts,
  locale: Locale
): PagePreview<PagePreviewArticle> {
  const { today } = data;
  const announcement = drafts.announcement;
  const cardOf = (
    article: PageCurationData["articles"][number]
  ): PagePreviewArticle => {
    const title = inLocale(
      { en: article.titleEn, es: article.titleEs },
      locale
    );

    return {
      cover: article.image ? { ...article.image, alt: title.text } : null,
      currencyCode: data.currencyCode,
      id: article.id,
      isAvailable: article.isAvailable,
      lang: title.lang,
      priceAmount: article.priceAmount ?? 0,
      slug: article.slug,
      title: title.text,
    };
  };
  const articles = new Map(
    data.articles.map((article) => [article.id, article])
  );
  // The banners that show today, each with where it goes.
  const banners = new Map(
    data.banners
      .filter((banner) => isShowing(banner, today))
      .map((banner) => {
        const title = inLocale(
          { en: banner.titleEn, es: banner.titleEs },
          locale
        );
        const shown: PageBanner = {
          ctaLabel: title.lang === "en" ? banner.ctaLabelEn : banner.ctaLabelEs,
          href: banner.href,
          id: banner.id,
          image: banner.image,
          lang: title.lang,
          phoneImage: banner.imagePhone,
          title: title.text,
        };

        return [banner.id, { placement: banner.placement, shown }] as const;
      })
  );
  const published = data.articles.filter(
    (article) => article.status === "published"
  );
  const curated = (ids: readonly number[]) =>
    ids.flatMap((id) => {
      const article = articles.get(id);

      return article?.status === "published" && article.isAvailable
        ? [cardOf(article)]
        : [];
    });
  const rowBanners = new Map(
    [...banners].flatMap(([id, banner]) =>
      banner.placement === "rows" ? [[id, banner.shown] as const] : []
    )
  );
  // A spotlight shows while its article can be bought, as on the
  // storefront (FER-059).
  const spotlights = new Map(
    data.spotlights.flatMap((entry) => {
      const article = articles.get(entry.productId);

      return article?.status === "published" && article.isAvailable
        ? [
            [
              entry.id,
              {
                article: cardOf(article),
                id: entry.id,
                label: wordIn({ en: entry.labelEn, es: entry.labelEs }, locale),
                phrase: wordIn(
                  { en: entry.phraseEn, es: entry.phraseEs },
                  locale
                ),
              },
            ] as const,
          ]
        : [];
    })
  );

  return {
    announcement:
      announcement && isShowing(announcement, today)
        ? previewAnnouncement(announcement, locale)
        : null,
    cover: drafts.layout.coverBannerIds.flatMap((id) => {
      const banner = banners.get(id);

      return banner?.placement === "cover" ? [banner.shown] : [];
    }),
    sections: composePageSections(
      resolvePageSections(drafts.layout.sections, {
        categoryIds: data.categories.map((entry) => entry.id),
        fillIn: data.page.isHome,
        rowBannerIds: [...rowBanners.keys()],
        spotlightIds: data.spotlights.flatMap((entry) =>
          entry.onPage ? [entry.id] : []
        ),
      }),
      {
        bestSellers: curated(drafts.layout.rankingProductIds),
        categories: new Map(
          data.categories.map((entry) => {
            const name = inLocale(
              { en: entry.nameEn, es: entry.nameEs },
              locale
            );

            return [
              entry.id,
              {
                articles: published
                  .filter((article) => article.categoryId === entry.id)
                  .slice(0, PAGE_CATEGORY_ROW_MAX)
                  .map((article) => cardOf(article)),
                lang: name.lang,
                name: name.text,
                path: entry.path,
              },
            ];
          })
        ),
        featured: curated(drafts.layout.featuredProductIds),
        rowBanners,
        spotlights,
      }
    ),
  };
}
