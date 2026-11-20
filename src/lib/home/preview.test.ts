import { describe, expect, test } from "vitest";

import type { HomeCurationData } from "@/lib/hooks/home";
import type { SaveAnnouncementValues } from "@/lib/schemas/home";

import { type HomePreviewDrafts, previewHomeContent } from "./preview";

type Article = HomeCurationData["articles"][number];
type Banner = HomeCurationData["banners"][number];

const IMAGE = { height: 800, url: "/seed/ring-1.jpg", width: 1200 };

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    categoryId: 1,
    id: 10,
    image: IMAGE,
    isAvailable: true,
    priceAmount: 1290,
    slug: "anillo-sello",
    status: "published",
    titleEn: "Signet ring",
    titleEs: "Anillo sello",
    ...overrides,
  };
}

function makeBanner(overrides: Partial<Banner> = {}): Banner {
  return {
    ctaLabelEn: "See it",
    ctaLabelEs: "Mirá",
    endsOn: null,
    href: "/burbujeros",
    id: 5,
    image: IMAGE,
    imagePhone: null,
    isActive: true,
    link: { categoryId: 1, kind: "category" },
    placement: "cover",
    startsOn: null,
    titleEn: "Bubbles",
    titleEs: "Burbujas",
    ...overrides,
  };
}

function makeAnnouncement(
  overrides: Partial<SaveAnnouncementValues> = {}
): SaveAnnouncementValues {
  return {
    endsOn: null,
    isActive: true,
    linkUrl: "/productos",
    shortTextEn: "At the fair",
    shortTextEs: "En la feria",
    startsOn: null,
    textEn: "Find us at the fair",
    textEs: "Encontranos en la feria",
    ...overrides,
  };
}

function makeData(overrides: Partial<HomeCurationData> = {}): HomeCurationData {
  return {
    announcement: null,
    articles: [makeArticle()],
    banners: [],
    categories: [
      {
        id: 1,
        nameEn: "Rings",
        nameEs: "Anillos",
        path: "/bijouterie/anillos",
      },
    ],
    coverBannerIds: [],
    currencyCode: "UYU",
    featuredProductIds: [],
    rankingProductIds: [],
    sections: [],
    today: "2026-12-04",
    ...overrides,
  };
}

function makeDrafts(
  overrides: Partial<HomePreviewDrafts["layout"]> = {},
  announcement: SaveAnnouncementValues | null = null
): HomePreviewDrafts {
  return {
    announcement,
    layout: {
      coverBannerIds: [],
      featuredProductIds: [],
      rankingProductIds: [],
      sections: [],
      ...overrides,
    },
  };
}

const RING_CARD_ES = {
  cover: { ...IMAGE, alt: "Anillo sello" },
  currencyCode: "UYU",
  id: 10,
  isAvailable: true,
  lang: "es",
  priceAmount: 1290,
  slug: "anillo-sello",
  title: "Anillo sello",
};

describe("previewHomeContent", () => {
  test("shows the drafted announcement in the page's language, with its link and short line", () => {
    const content = previewHomeContent(
      makeData(),
      makeDrafts({}, makeAnnouncement()),
      "en"
    );

    expect(content.announcement).toEqual({
      href: "/productos",
      lang: "en",
      shortText: "At the fair",
      text: "Find us at the fair",
    });
  });

  test("falls back to the Spanish words when there is no English text", () => {
    const content = previewHomeContent(
      makeData(),
      makeDrafts({}, makeAnnouncement({ shortTextEn: null, textEn: null })),
      "en"
    );

    expect(content.announcement).toEqual({
      href: "/productos",
      lang: "es",
      shortText: "En la feria",
      text: "Encontranos en la feria",
    });
  });

  test.each([
    ["no draft that reads", null],
    ["a switched-off draft", makeAnnouncement({ isActive: false })],
    [
      "a draft that ended yesterday",
      makeAnnouncement({ endsOn: "2026-12-03" }),
    ],
  ])("shows no announcement for %s", (_case, announcement) => {
    expect(
      previewHomeContent(makeData(), makeDrafts({}, announcement), "es")
        .announcement
    ).toBeNull();
  });

  test("shows the cover's banners in the drafted order, only those that show today", () => {
    const data = makeData({
      banners: [
        makeBanner({ id: 5 }),
        makeBanner({ id: 6, imagePhone: IMAGE, titleEn: null }),
        makeBanner({ id: 7, startsOn: "2026-12-05" }),
        makeBanner({ id: 8, placement: "rows" }),
      ],
    });

    const content = previewHomeContent(
      data,
      makeDrafts({ coverBannerIds: [6, 7, 8, 5] }),
      "en"
    );

    expect(content.cover).toEqual([
      {
        ctaLabel: "Mirá",
        href: "/burbujeros",
        id: 6,
        image: IMAGE,
        lang: "es",
        phoneImage: IMAGE,
        title: "Burbujas",
      },
      {
        ctaLabel: "See it",
        href: "/burbujeros",
        id: 5,
        image: IMAGE,
        lang: "en",
        phoneImage: null,
        title: "Bubbles",
      },
    ]);
  });

  test("fills the drafted sequence: category rows with their published articles, curated rows with what can be bought, banners that show", () => {
    const data = makeData({
      articles: [
        makeArticle(),
        makeArticle({ id: 11, status: "draft", titleEs: "Borrador" }),
        makeArticle({ id: 12, isAvailable: false, titleEs: "Agotado" }),
        makeArticle({
          categoryId: null,
          id: 13,
          image: null,
          priceAmount: null,
          titleEn: null,
          titleEs: "Sin categoría",
        }),
      ],
      banners: [
        makeBanner({ id: 8, placement: "rows" }),
        makeBanner({ id: 9, isActive: false, placement: "rows" }),
      ],
    });

    const content = previewHomeContent(
      data,
      makeDrafts({
        featuredProductIds: [13, 11],
        rankingProductIds: [12, 99, 10],
        sections: [
          { bannerId: 8, kind: "banner" },
          { bannerId: 9, kind: "banner" },
          { kind: "featured" },
          { categoryId: 1, kind: "category" },
          { kind: "best_sellers" },
        ],
      }),
      "es"
    );

    expect(content.sections).toEqual([
      {
        banner: {
          ctaLabel: "Mirá",
          href: "/burbujeros",
          id: 8,
          image: IMAGE,
          lang: "es",
          phoneImage: null,
          title: "Burbujas",
        },
        key: "banner:8",
        kind: "banner",
      },
      {
        articles: [
          {
            cover: null,
            currencyCode: "UYU",
            id: 13,
            isAvailable: true,
            lang: "es",
            priceAmount: 0,
            slug: "anillo-sello",
            title: "Sin categoría",
          },
        ],
        key: "featured",
        kind: "featured",
      },
      {
        // The sold-out article stays in its category's row, the draft not.
        articles: [
          RING_CARD_ES,
          {
            ...RING_CARD_ES,
            cover: { ...IMAGE, alt: "Agotado" },
            id: 12,
            isAvailable: false,
            title: "Agotado",
          },
        ],
        category: {
          id: 1,
          lang: "es",
          name: "Anillos",
          path: "/bijouterie/anillos",
        },
        key: "category:1",
        kind: "category",
      },
      { articles: [RING_CARD_ES], key: "best_sellers", kind: "best_sellers" },
    ]);
  });

  test("names a category in English when it has an English name, and caps its row at twelve", () => {
    const data = makeData({
      articles: Array.from({ length: 13 }, (_unused, index) =>
        makeArticle({ id: 100 + index })
      ),
    });

    const [row] = previewHomeContent(
      data,
      makeDrafts({ sections: [{ categoryId: 1, kind: "category" }] }),
      "en"
    ).sections;

    expect(row).toMatchObject({
      category: { lang: "en", name: "Rings" },
      kind: "category",
    });
    expect(
      row?.kind === "category" ? row.articles.map((card) => card.id) : []
    ).toEqual(Array.from({ length: 12 }, (_unused, index) => 100 + index));
  });
});
