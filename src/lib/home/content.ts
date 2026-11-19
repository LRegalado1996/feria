import type { CoverImage } from "@/lib/catalog/cover";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import {
  type HomeSection,
  homeSectionKey,
  isSitePath,
} from "@/lib/schemas/home";

/**
 * Where something of the home leads: a path of this site, unlocalized
 * (`/productos/anillo`, `/bijouterie`), or a full `https` address. A page
 * turns it into an `href` with `homeHref`.
 */
export type HomeLink = string;

/** `link` as an `href` of a page in `locale`: a site path gets the language. */
export function homeHref(link: HomeLink, locale: Locale): string {
  return isSitePath(link) ? localizePath(link, locale) : link;
}

/** The announcement bar as the storefront shows it now (FER-020). */
export interface HomeAnnouncement {
  /** Where the bar leads, or `null` when it is only words. */
  href: HomeLink | null;
  /** The language its words are in, which may differ from the page's. */
  lang: Locale;
  /** The line a phone shows instead, or `null` to show `text` there too. */
  shortText: string | null;
  text: string;
}

/** A photo banner as the storefront shows it now (FER-020). */
export interface HomeBanner {
  /** Its button's words, or `null` for the dictionary's "Comprar ahora". */
  ctaLabel: string | null;
  /**
   * Where it leads, or `null`: no link was set, or it led to an article
   * that is no longer published (the banner still shows, without a link).
   */
  href: HomeLink | null;
  id: number;
  /** The computer's photo; a phone crops it when there is no `phoneImage`. */
  image: CoverImage;
  /** The language of its title and label, which may differ from the page's. */
  lang: Locale;
  phoneImage: CoverImage | null;
  title: string;
}

/** A row of articles' place in the sequence, with its articles. */
export type HomeRow<Article> =
  | {
      articles: Article[];
      kind: "best_sellers" | "featured";
      /** Unique in the sequence: a React key. */
      key: string;
    }
  | {
      articles: Article[];
      category: {
        id: number;
        /** The language of its name, which may differ from the page's. */
        lang: Locale;
        name: string;
        /** Its page, unlocalized: where "Ver todo" leads. */
        path: string;
      };
      kind: "category";
      key: string;
    };

/** One place of the home's sequence under the cover, as it shows now. */
export type HomeContentSection<Article> =
  | HomeRow<Article>
  | { banner: HomeBanner; key: string; kind: "banner" };

/**
 * What the storefront's home shows right now (FER-020, read by FER-022's
 * home), already filtered: the announcement only while it is on and inside
 * its days; the cover's banners in their order, the same rule; then the
 * sequence of rows and banners between them, in the order the admin set,
 * holding only what has something to show: a category's row only with
 * published articles, the curated rows ("best sellers", "featured") only
 * with articles that are published and available, a banner only while it
 * is on and inside its days. Every section can be empty of others: a new
 * store's home is `{ announcement: null, cover: [], sections: [] }`.
 */
export interface HomeContent<Article> {
  announcement: HomeAnnouncement | null;
  cover: HomeBanner[];
  sections: HomeContentSection<Article>[];
}

/** What `composeHomeSections` fills the sequence with. */
export interface HomeSectionSources<Article> {
  /** The best sellers that can show, in their order. */
  bestSellers: readonly Article[];
  /** Each category's row: its name, page and the articles it shows. */
  categories: ReadonlyMap<
    number,
    { articles: readonly Article[]; lang: Locale; name: string; path: string }
  >;
  /** The featured articles that can show, in their order. */
  featured: readonly Article[];
  /** The banners between rows that show now, by id. */
  rowBanners: ReadonlyMap<number, HomeBanner>;
}

/**
 * The sequence under the cover as it shows: each place of `sections` (the
 * resolved order, `resolveHomeSections`) with its content, leaving out a
 * row with no article and a banner that does not show. The storefront's
 * read and the admin's preview both build it here.
 */
export function composeHomeSections<Article>(
  sections: readonly HomeSection[],
  sources: HomeSectionSources<Article>
): HomeContentSection<Article>[] {
  return sections.flatMap((section): HomeContentSection<Article>[] => {
    const key = homeSectionKey(section);

    if (section.kind === "banner") {
      const banner = sources.rowBanners.get(section.bannerId);

      return banner ? [{ banner, key, kind: "banner" }] : [];
    }

    if (section.kind === "category") {
      const row = sources.categories.get(section.categoryId);

      return row && row.articles.length > 0
        ? [
            {
              articles: [...row.articles],
              category: {
                id: section.categoryId,
                lang: row.lang,
                name: row.name,
                path: row.path,
              },
              key,
              kind: "category",
            },
          ]
        : [];
    }

    const articles =
      section.kind === "best_sellers" ? sources.bestSellers : sources.featured;

    return articles.length > 0
      ? [{ articles: [...articles], key, kind: section.kind }]
      : [];
  });
}

/** How many articles a category's row on the home shows at most. */
export const HOME_CATEGORY_ROW_MAX = 12;
