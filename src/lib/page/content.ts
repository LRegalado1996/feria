import type { CoverImage } from "@/lib/catalog/cover";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import {
  type PageSection,
  pageSectionKey,
  isSitePath,
} from "@/lib/schemas/page";

/**
 * Where something of a page leads: a path of this site, unlocalized
 * (`/productos/anillo`, `/bijouterie`), or a full `https` address. A page
 * turns it into an `href` with `pageHref`.
 */
export type PageLink = string;

/** `link` as an `href` of a page in `locale`: a site path gets the language. */
export function pageHref(link: PageLink, locale: Locale): string {
  return isSitePath(link) ? localizePath(link, locale) : link;
}

/** The announcement bar as the storefront's frame shows it now (FER-020). */
export interface ShownAnnouncement {
  /** Where the bar leads, or `null` when it is only words. */
  href: PageLink | null;
  /** The language its words are in, which may differ from the page's. */
  lang: Locale;
  /** The line a phone shows instead, or `null` to show `text` there too. */
  shortText: string | null;
  text: string;
}

/** A photo banner as a page shows it now (FER-020). */
export interface PageBanner {
  /** Its button's words, or `null` for the dictionary's "Comprar ahora". */
  ctaLabel: string | null;
  /**
   * Where it leads, or `null`: no link was set, or it led to an article
   * that is no longer published (the banner still shows, without a link).
   */
  href: PageLink | null;
  id: number;
  /** The computer's photo; a phone crops it when there is no `phoneImage`. */
  image: CoverImage;
  /** The language of its title and label, which may differ from the page's. */
  lang: Locale;
  phoneImage: CoverImage | null;
  title: string;
}

/** Words of a block in the language they are in, maybe not the page's. */
export interface PageWords {
  lang: Locale;
  text: string;
}

/**
 * An article in the spotlight (FER-059), as a page shows it: the article
 * (published and available, or it is left out), and its optional label
 * and phrase, each in the page's language or the one it has.
 */
export interface PageSpotlight<Article> {
  article: Article;
  id: number;
  label: PageWords | null;
  phrase: PageWords | null;
}

/** A row of articles' place in the sequence, with its articles. */
export type PageRow<Article> =
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

/** One place of a page's sequence under the cover, as it shows now. */
export type PageContentSection<Article> =
  | PageRow<Article>
  | { banner: PageBanner; key: string; kind: "banner" }
  | { key: string; kind: "spotlight"; spotlight: PageSpotlight<Article> }
  /** "How to buy" (FER-076): its words are the interface's, so it holds none. */
  | { key: string; kind: "how_to_buy" };

/**
 * Whether a section sells something or leads somewhere: every kind but
 * "how to buy", which explains how to order what the others show. A home
 * with nothing else introduces the store instead (`organisms/store-home`).
 */
export function isOffer<Article>(
  section: PageContentSection<Article>
): boolean {
  return section.kind !== "how_to_buy";
}

/**
 * What a page of the storefront shows right now (FER-058, after FER-020's
 * home read), already filtered: its cover's banners in their order, only
 * those on and inside their days; then its sequence of blocks in the order
 * the admin set, holding only what has something to show: a category's row
 * only with published articles, the curated rows ("best sellers",
 * "featured") only with articles that are published and available, a
 * banner only while it is on and inside its days, an article spotlight
 * only while its article is published and can be bought, "how to buy"
 * wherever the admin placed it. Either part can be
 * empty: a new store's home is `{ cover: [], sections: [] }`.
 */
export interface PageContent<Article> {
  cover: PageBanner[];
  sections: PageContentSection<Article>[];
}

/** What `composePageSections` fills the sequence with. */
export interface PageSectionSources<Article> {
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
  rowBanners: ReadonlyMap<number, PageBanner>;
  /** The spotlights that can show now (their article can be bought), by id. */
  spotlights: ReadonlyMap<number, PageSpotlight<Article>>;
}

/**
 * A page's sequence under its cover as it shows: each place of `sections`
 * (the resolved order, `resolvePageSections`) with its content, leaving out
 * a row with no article and a banner that does not show. The storefront's
 * read and the admin's preview both build it here.
 */
export function composePageSections<Article>(
  sections: readonly PageSection[],
  sources: PageSectionSources<Article>
): PageContentSection<Article>[] {
  return sections.flatMap((section): PageContentSection<Article>[] => {
    const key = pageSectionKey(section);

    if (section.kind === "banner") {
      const banner = sources.rowBanners.get(section.bannerId);

      return banner ? [{ banner, key, kind: "banner" }] : [];
    }

    if (section.kind === "spotlight") {
      const spotlight = sources.spotlights.get(section.spotlightId);

      return spotlight ? [{ key, kind: "spotlight", spotlight }] : [];
    }

    if (section.kind === "how_to_buy") {
      return [{ key, kind: "how_to_buy" }];
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

/** How many articles a category's row on a page shows at most. */
export const PAGE_CATEGORY_ROW_MAX = 12;
