import { describe, expect, test } from "vitest";

import type { PageSection } from "@/lib/schemas/page";

import {
  DEFAULT_ROWS_INDEX,
  DEFAULT_SPOTLIGHT_INDEX,
  followServerLayout,
  followServerOrder,
  placePageSection,
  resolvePageSections,
  sameLayoutList,
} from "./layout";

const BEST: PageSection = { kind: "best_sellers" };
const FEATURED: PageSection = { kind: "featured" };

function makeCategory(categoryId: number): PageSection {
  return { categoryId, kind: "category" };
}

function makeBanner(bannerId: number): PageSection {
  return { bannerId, kind: "banner" };
}

function makeSpotlight(spotlightId: number): PageSection {
  return { kind: "spotlight", spotlightId };
}

describe("resolvePageSections", () => {
  test("a store that never saved opens on the best sellers, the featured, then its categories and banners in their order", () => {
    expect(
      resolvePageSections([], {
        categoryIds: [3, 1],
        rowBannerIds: [9],
        spotlightIds: [],
      })
    ).toEqual([
      BEST,
      FEATURED,
      makeCategory(3),
      makeCategory(1),
      makeBanner(9),
    ]);
  });

  test("keeps the saved order, dropping what is gone and placing what is new after it", () => {
    const saved = [
      makeCategory(2),
      makeBanner(8),
      FEATURED,
      makeCategory(5),
      BEST,
      makeBanner(7),
    ];

    expect(
      resolvePageSections(saved, {
        // 5 was deleted, 6 is new; banner 7 went to the cover, 9 is new.
        categoryIds: [6, 2],
        rowBannerIds: [8, 9],
        spotlightIds: [],
      })
    ).toEqual([
      makeCategory(2),
      makeBanner(8),
      FEATURED,
      BEST,
      makeCategory(6),
      makeBanner(9),
    ]);
  });

  test("keeps the article spotlights still on the page in their places, and puts one with no place after the rest", () => {
    expect(
      resolvePageSections(
        [makeSpotlight(4), makeCategory(1), makeSpotlight(3), BEST, FEATURED],
        // 3 was deleted; 6 is on the page with no place yet.
        { categoryIds: [1], rowBannerIds: [], spotlightIds: [4, 6] }
      )
    ).toEqual([
      makeSpotlight(4),
      makeCategory(1),
      BEST,
      FEATURED,
      makeSpotlight(6),
    ]);
  });

  test("puts a missing curated row first, the best sellers before the featured", () => {
    expect(
      resolvePageSections([makeCategory(1), FEATURED], {
        categoryIds: [1],
        rowBannerIds: [],
        spotlightIds: [],
      })
    ).toEqual([BEST, makeCategory(1), FEATURED]);
  });

  test("lists a place given twice once, where it first stood", () => {
    expect(
      resolvePageSections(
        [makeCategory(1), BEST, makeCategory(1), FEATURED, BEST],
        { categoryIds: [1], rowBannerIds: [], spotlightIds: [] }
      )
    ).toEqual([makeCategory(1), BEST, FEATURED]);
  });
});

describe("placePageSection", () => {
  const sections = [BEST, makeCategory(1), FEATURED];

  test.each([
    [0, [makeBanner(4), BEST, makeCategory(1), FEATURED]],
    [1, [BEST, makeBanner(4), makeCategory(1), FEATURED]],
    [3, [BEST, makeCategory(1), FEATURED, makeBanner(4)]],
    // Clamped to the ends.
    [9, [BEST, makeCategory(1), FEATURED, makeBanner(4)]],
    [-2, [makeBanner(4), BEST, makeCategory(1), FEATURED]],
  ])("places a banner at %s", (index, expected) => {
    expect(placePageSection(sections, makeBanner(4), index)).toEqual(expected);
  });

  test("takes a banner out of where it was before placing it", () => {
    expect(
      placePageSection(
        [makeBanner(4), BEST, makeCategory(1), FEATURED],
        makeBanner(4),
        2
      )
    ).toEqual([BEST, makeCategory(1), makeBanner(4), FEATURED]);
  });

  test("by default a banner goes after the first row", () => {
    expect(DEFAULT_ROWS_INDEX).toBe(1);
  });

  test("by default an article spotlight goes first, right under the cover", () => {
    expect(
      placePageSection(sections, makeSpotlight(2), DEFAULT_SPOTLIGHT_INDEX)
    ).toEqual([makeSpotlight(2), BEST, makeCategory(1), FEATURED]);
  });
});

describe("followServerOrder", () => {
  const key = (letter: string) => letter;

  test("an order that was not moved becomes the server's, its new order included", () => {
    expect(
      followServerOrder(
        {
          draft: ["a", "b", "c"],
          next: ["c", "a", "d"],
          previous: ["a", "b", "c"],
        },
        key
      )
    ).toEqual(["c", "a", "d"]);
  });

  test("a moved order keeps its order, less what the server dropped", () => {
    expect(
      followServerOrder(
        { draft: ["c", "a", "b"], next: ["a", "c"], previous: ["a", "b", "c"] },
        key
      )
    ).toEqual(["c", "a"]);
  });

  test("a moved order takes what is new at the server's index", () => {
    expect(
      followServerOrder(
        {
          draft: ["c", "b", "a"],
          next: ["x", "a", "b", "y", "c", "z"],
          previous: ["a", "b", "c"],
        },
        key
      )
    ).toEqual(["x", "c", "b", "y", "a", "z"]);
  });

  test("an entry the draft added stays where the draft put it, though the server never held it", () => {
    expect(
      followServerOrder(
        { draft: ["a", "n", "b"], next: ["b", "a"], previous: ["a", "b"] },
        key
      )
    ).toEqual(["a", "n", "b"]);
  });

  test("an entry the draft added goes once what it shows is gone", () => {
    expect(
      followServerOrder(
        { draft: ["a", "n", "m", "b"], next: ["a", "b"], previous: ["a", "b"] },
        key,
        (letter) => letter !== "n"
      )
    ).toEqual(["a", "m", "b"]);
  });

  test("an entry the draft took out stays out, though the server still holds it", () => {
    expect(
      followServerOrder(
        { draft: ["b"], next: ["a", "b", "x"], previous: ["a", "b"] },
        key
      )
    ).toEqual(["b", "x"]);
  });

  test("each entry is the server's own", () => {
    const fresh = { id: "a", title: "new" };

    expect(
      followServerOrder(
        {
          draft: [
            { id: "b", title: "b" },
            { id: "a", title: "old" },
          ],
          next: [fresh, { id: "b", title: "b" }],
          previous: [
            { id: "a", title: "old" },
            { id: "b", title: "b" },
          ],
        },
        (item) => item.id
      )[1]
    ).toBe(fresh);
  });
});

describe("followServerLayout", () => {
  /** What the store holds now: every banner, category and spotlight the lists name. */
  function makeTargets(
    articles: number[],
    {
      banners = [1, 2, 3, 9],
      categories = [4],
      spotlights = [51, 52],
    }: { banners?: number[]; categories?: number[]; spotlights?: number[] } = {}
  ) {
    return {
      articles: new Set(articles),
      banners: new Set(banners),
      categories: new Set(categories),
      spotlights: new Set(spotlights),
    };
  }

  function makeLists(
    overrides: Partial<Parameters<typeof followServerLayout>[0]["next"]> = {}
  ) {
    return {
      cover: [{ bannerId: 1 }, { bannerId: 2 }],
      featured: [{ productId: 5 }, { productId: 6 }],
      ranking: [{ productId: 7 }, { productId: 8 }],
      sections: [
        { section: BEST },
        { section: makeBanner(3) },
        { section: makeCategory(4) },
        { section: FEATURED },
      ],
      ...overrides,
    };
  }

  test("an untouched form becomes the server's", () => {
    const next = makeLists({ cover: [{ bannerId: 2 }], ranking: [] });

    expect(
      followServerLayout(
        { draft: makeLists(), next, previous: makeLists() },
        makeTargets([5, 6])
      )
    ).toEqual(next);
  });

  test("a deleted banner leaves the moved rows, the rest keeps the draft's order", () => {
    const draft = makeLists({
      sections: [
        { section: makeCategory(4) },
        { section: BEST },
        { section: makeBanner(3) },
        { section: FEATURED },
      ],
    });
    const next = makeLists({
      sections: [
        { section: BEST },
        { section: makeCategory(4) },
        { section: FEATURED },
      ],
    });

    expect(
      followServerLayout(
        { draft, next, previous: makeLists() },
        makeTargets([5, 6, 7, 8])
      ).sections
    ).toEqual([
      { section: makeCategory(4) },
      { section: BEST },
      { section: FEATURED },
    ]);
  });

  test("a banner new between rows goes where the server placed it in a moved order", () => {
    const draft = makeLists({
      sections: [
        { section: FEATURED },
        { section: BEST },
        { section: makeBanner(3) },
        { section: makeCategory(4) },
      ],
    });
    const next = makeLists({
      sections: [
        { section: BEST },
        { section: makeBanner(9) },
        { section: makeBanner(3) },
        { section: makeCategory(4) },
        { section: FEATURED },
      ],
    });

    expect(
      followServerLayout(
        { draft, next, previous: makeLists() },
        makeTargets([5, 6, 7, 8])
      ).sections
    ).toEqual([
      { section: FEATURED },
      { section: makeBanner(9) },
      { section: BEST },
      { section: makeBanner(3) },
      { section: makeCategory(4) },
    ]);
  });

  test("an article spotlight new on the server joins a moved order at the server's index, beside one already there", () => {
    const previous = makeLists({
      sections: [
        { section: BEST },
        { section: makeSpotlight(51) },
        { section: makeBanner(3) },
        { section: makeCategory(4) },
        { section: FEATURED },
      ],
    });
    const draft = makeLists({
      sections: [
        { section: makeCategory(4) },
        { section: BEST },
        { section: makeSpotlight(51) },
        { section: makeBanner(3) },
        { section: FEATURED },
      ],
    });
    const next = makeLists({
      sections: [{ section: makeSpotlight(52) }, ...previous.sections],
    });

    expect(
      followServerLayout({ draft, next, previous }, makeTargets([5, 6, 7, 8]))
        .sections
    ).toEqual([
      { section: makeSpotlight(52) },
      { section: makeCategory(4) },
      { section: BEST },
      { section: makeSpotlight(51) },
      { section: makeBanner(3) },
      { section: FEATURED },
    ]);
  });

  test("a banner moved from the cover to the rows leaves the moved cover and joins the moved rows", () => {
    const draft = makeLists({
      cover: [{ bannerId: 2 }, { bannerId: 1 }],
      sections: [
        { section: makeCategory(4) },
        { section: BEST },
        { section: makeBanner(3) },
        { section: FEATURED },
      ],
    });
    const next = makeLists({
      cover: [{ bannerId: 2 }],
      sections: [
        { section: BEST },
        { section: makeBanner(1) },
        { section: makeBanner(3) },
        { section: makeCategory(4) },
        { section: FEATURED },
      ],
    });

    const lists = followServerLayout(
      { draft, next, previous: makeLists() },
      makeTargets([5, 6, 7, 8])
    );

    expect(lists.cover).toEqual([{ bannerId: 2 }]);
    expect(lists.sections).toEqual([
      { section: makeCategory(4) },
      { section: makeBanner(1) },
      { section: BEST },
      { section: makeBanner(3) },
      { section: FEATURED },
    ]);
  });

  test("a block only the draft added goes once what it shows is gone, and stays while it is there", () => {
    const previous = makeLists();
    const draft = makeLists({
      cover: [{ bannerId: 1 }, { bannerId: 2 }, { bannerId: 9 }],
      sections: [
        ...previous.sections,
        { section: makeCategory(6) },
        { section: makeCategory(7) },
        { section: makeSpotlight(51) },
        { section: makeSpotlight(52) },
        { section: makeBanner(8) },
      ],
    });

    const lists = followServerLayout(
      { draft, next: makeLists(), previous },
      // Category 6, spotlight 52 and banners 8 and 9 deleted meanwhile.
      makeTargets([5, 6, 7, 8], {
        banners: [1, 2, 3],
        categories: [4, 7],
        spotlights: [51],
      })
    );

    expect(lists.cover).toEqual([{ bannerId: 1 }, { bannerId: 2 }]);
    expect(lists.sections).toEqual([
      ...previous.sections,
      { section: makeCategory(7) },
      { section: makeSpotlight(51) },
    ]);
  });

  test("a moved curated row keeps its order, less the articles that are gone, and an article taken out stays out", () => {
    const draft = makeLists({
      featured: [{ productId: 6 }, { productId: 5 }],
      ranking: [{ productId: 8 }],
    });

    const lists = followServerLayout(
      { draft, next: makeLists(), previous: makeLists() },
      makeTargets([5, 7, 8])
    );

    expect(lists.featured).toEqual([{ productId: 5 }]);
    expect(lists.ranking).toEqual([{ productId: 8 }]);
  });
});

describe("sameLayoutList", () => {
  test.each([
    [[{ bannerId: 1 }, { bannerId: 2 }], true],
    [[{ bannerId: 2 }, { bannerId: 1 }], false],
    [[{ bannerId: 1 }], false],
  ])("compares %j with the same entries in order: %s", (other, same) => {
    expect(sameLayoutList([{ bannerId: 1 }, { bannerId: 2 }], other)).toBe(
      same
    );
  });
});
