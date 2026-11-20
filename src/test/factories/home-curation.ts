import type { PageCurationData } from "@/lib/hooks/page";

type Article = PageCurationData["articles"][number];
type Banner = PageCurationData["banners"][number];
type Category = PageCurationData["categories"][number];
type Spotlight = PageCurationData["spotlights"][number];

/** An article of the store, published and available unless a test says so. */
export function makeHomeArticle(overrides: Partial<Article> = {}): Article {
  return {
    categoryId: 4,
    id: 21,
    image: { height: 900, url: "/seed/ring-1.jpg", width: 900 },
    isAvailable: true,
    priceAmount: 129_000,
    slug: "anillo-sello",
    status: "published",
    titleEn: "Signet ring",
    titleEs: "Anillo sello",
    ...overrides,
  };
}

/** A banner of the cover, showing, leading nowhere, unless a test says so. */
export function makeHomeBanner(overrides: Partial<Banner> = {}): Banner {
  return {
    ctaLabelEn: null,
    ctaLabelEs: null,
    endsOn: null,
    href: null,
    id: 31,
    image: { height: 1067, url: "/seed/bubble-gun-2.jpg", width: 1600 },
    imagePhone: null,
    isActive: true,
    link: { kind: "none" },
    placement: "cover",
    startsOn: null,
    titleEn: "Bubble guns",
    titleEs: "Burbujeros",
    ...overrides,
  };
}

/** An article spotlight on the page, of the default article, with words. */
export function makeHomeSpotlight(
  overrides: Partial<Spotlight> = {}
): Spotlight {
  return {
    id: 51,
    labelEn: "New",
    labelEs: "Nuevo",
    onPage: true,
    phraseEn: "The one kids ask for most.",
    phraseEs: "El que más piden los chicos.",
    productId: 21,
    ...overrides,
  };
}

/** A category of the store. */
export function makeHomeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 4,
    nameEn: "Rings",
    nameEs: "Anillos",
    path: "/bijouterie/anillos",
    ...overrides,
  };
}

/**
 * What `page.get` answers for the home page (FER-020, FER-058): no announcement yet, no banner, one
 * category with one published article, the curated rows empty, read on
 * 2026-11-20, unless a test says otherwise.
 */
export function makeHomeCuration(
  overrides: Partial<PageCurationData> = {}
): PageCurationData {
  return {
    announcement: null,
    articles: [makeHomeArticle()],
    banners: [],
    categories: [makeHomeCategory()],
    coverBannerIds: [],
    currencyCode: "UYU",
    featuredProductIds: [],
    pageId: 1,
    rankingProductIds: [],
    sections: [
      { kind: "best_sellers" },
      { kind: "featured" },
      { categoryId: 4, kind: "category" },
    ],
    spotlights: [],
    today: "2026-11-20",
    ...overrides,
  };
}
