import { describe, expect, test } from "vitest";

import type { PageCurationData } from "@/lib/hooks/page";
import type { SaveAnnouncementValues } from "@/lib/schemas/page";
import { makeHomePage } from "@/test/factories/home-curation";

import { type PagePreviewDrafts, previewPageContent } from "./preview";

type Article = PageCurationData["articles"][number];
type Banner = PageCurationData["banners"][number];

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

/** A spotlight on the page, of article 10, with no words. */
const SPOTLIGHT_ROW = {
  id: 50,
  labelEn: null,
  labelEs: null,
  onPage: true,
  phraseEn: null,
  phraseEs: null,
  productId: 10,
};

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

function makeData(overrides: Partial<PageCurationData> = {}): PageCurationData {
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
    page: makeHomePage(),
    pageId: 1,
    rankingProductIds: [],
    sections: [],
    spotlights: [],
    today: "2026-12-04",
    ...overrides,
  };
}

function makeDrafts(
  overrides: Partial<PagePreviewDrafts["layout"]> = {},
  announcement: SaveAnnouncementValues | null = null
): PagePreviewDrafts {
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

describe("previewPageContent", () => {
  test("shows the drafted announcement in the page's language, with its link and short line", () => {
    const content = previewPageContent(
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
    const content = previewPageContent(
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
      previewPageContent(makeData(), makeDrafts({}, announcement), "es")
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
        // Not on this page (FER-058): listed by a stale draft, it shows not.
        makeBanner({ id: 9, placement: null }),
      ],
    });

    const content = previewPageContent(
      data,
      makeDrafts({ coverBannerIds: [6, 7, 8, 9, 5] }),
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

    const content = previewPageContent(
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

  test.each([
    [
      "es",
      { lang: "es", text: "Nuevo" },
      { lang: "es", text: "El que más piden." },
    ],
    // No English phrase: the Spanish one, marked as such.
    [
      "en",
      { lang: "en", text: "New" },
      { lang: "es", text: "El que más piden." },
    ],
  ] as const)(
    "draws an article spotlight on the page, in %s, while its article can be bought",
    (locale, label, phrase) => {
      const data = makeData({
        articles: [
          makeArticle(),
          makeArticle({ id: 11, status: "draft" }),
          makeArticle({ id: 12, isAvailable: false }),
        ],
        spotlights: [
          {
            id: 51,
            labelEn: "New",
            labelEs: "Nuevo",
            onPage: true,
            phraseEn: null,
            phraseEs: "El que más piden.",
            productId: 10,
          },
          // A draft's and a sold-out article's leave the page.
          { ...SPOTLIGHT_ROW, id: 52, productId: 11 },
          { ...SPOTLIGHT_ROW, id: 53, productId: 12 },
          // On another page: listed by a stale draft, it shows not.
          { ...SPOTLIGHT_ROW, id: 54, onPage: false, productId: 10 },
        ],
      });

      const content = previewPageContent(
        data,
        makeDrafts({
          sections: [
            { kind: "spotlight", spotlightId: 52 },
            { kind: "spotlight", spotlightId: 51 },
            { kind: "spotlight", spotlightId: 53 },
            { kind: "spotlight", spotlightId: 54 },
          ],
        }),
        locale
      );

      // The category's row, appended as on the home, is not this test's.
      expect(
        content.sections.filter((section) => section.kind === "spotlight")
      ).toEqual([
        {
          key: "spotlight:51",
          kind: "spotlight",
          spotlight: {
            article: expect.objectContaining({ id: 10, slug: "anillo-sello" }),
            id: 51,
            label,
            phrase,
          },
        },
      ]);
    }
  );

  test("a spotlight with no words shows none", () => {
    const data = makeData({ spotlights: [SPOTLIGHT_ROW] });

    const [section] = previewPageContent(
      data,
      makeDrafts({ sections: [{ kind: "spotlight", spotlightId: 50 }] }),
      "en"
    ).sections;

    expect(section).toMatchObject({
      spotlight: { label: null, phrase: null },
    });
  });

  test("names a category in English when it has an English name, and caps its row at twelve", () => {
    const data = makeData({
      articles: Array.from({ length: 13 }, (_unused, index) =>
        makeArticle({ id: 100 + index })
      ),
    });

    const [row] = previewPageContent(
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
