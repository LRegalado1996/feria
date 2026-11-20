import type { HomeCurationData } from "@/lib/hooks/home";
import type { Locale } from "@/lib/i18n/config";
import type {
  SaveAnnouncementValues,
  SaveHomeLayoutValues,
} from "@/lib/schemas/home";
import type { Currency } from "@/lib/utils/format";

import {
  composeHomeSections,
  HOME_CATEGORY_ROW_MAX,
  type HomeAnnouncement,
  type HomeBanner,
  type HomeContent,
} from "./content";
import { resolveHomeSections } from "./layout";
import { isShowing } from "./schedule";

/** An article as the preview's cards show it: the catalog card's fields. */
export interface HomePreviewArticle {
  cover: { alt: string; height: number; url: string; width: number } | null;
  currencyCode: Currency;
  id: number;
  isAvailable: boolean;
  lang: Locale;
  priceAmount: number;
  slug: string;
  title: string;
}

/** What the admin has typed and ordered, before it is saved. */
export interface HomePreviewDrafts {
  /** The announcement form's values once they read, else `null`. */
  announcement: SaveAnnouncementValues | null;
  layout: SaveHomeLayoutValues;
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

/** The announcement's words in `locale`, as the storefront's read gives them. */
function previewAnnouncement(
  announcement: SaveAnnouncementValues,
  locale: Locale
): HomeAnnouncement {
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
 * The home the storefront would show with the admin's drafts (FER-020's
 * preview), on the business day the data was read, in `locale`: the same
 * rules as the storefront's read (`getHomeContent`), applied in the
 * browser to what the screen holds. A draft that does not read (a field
 * left wrong) shows no announcement until it does.
 */
export function previewHomeContent(
  data: HomeCurationData,
  drafts: HomePreviewDrafts,
  locale: Locale
): HomeContent<HomePreviewArticle> {
  const { today } = data;
  const announcement = drafts.announcement;
  const cardOf = (
    article: HomeCurationData["articles"][number]
  ): HomePreviewArticle => {
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
        const shown: HomeBanner = {
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

  return {
    announcement:
      announcement && isShowing(announcement, today)
        ? previewAnnouncement(announcement, locale)
        : null,
    cover: drafts.layout.coverBannerIds.flatMap((id) => {
      const banner = banners.get(id);

      return banner?.placement === "cover" ? [banner.shown] : [];
    }),
    sections: composeHomeSections(
      resolveHomeSections(drafts.layout.sections, {
        categoryIds: data.categories.map((entry) => entry.id),
        rowBannerIds: [...rowBanners.keys()],
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
                  .slice(0, HOME_CATEGORY_ROW_MAX)
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
      }
    ),
  };
}
