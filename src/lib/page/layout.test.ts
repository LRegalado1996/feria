import { describe, expect, test } from "vitest";

import type { PageSection } from "@/lib/schemas/page";

import {
  DEFAULT_ROWS_INDEX,
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

describe("resolvePageSections", () => {
  test("a store that never saved opens on the best sellers, the featured, then its categories and banners in their order", () => {
    expect(
      resolvePageSections([], { categoryIds: [3, 1], rowBannerIds: [9] })
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

  test("puts a missing curated row first, the best sellers before the featured", () => {
    expect(
      resolvePageSections([makeCategory(1), FEATURED], {
        categoryIds: [1],
        rowBannerIds: [],
      })
    ).toEqual([BEST, makeCategory(1), FEATURED]);
  });

  test("lists a place given twice once, where it first stood", () => {
    expect(
      resolvePageSections(
        [makeCategory(1), BEST, makeCategory(1), FEATURED, BEST],
        { categoryIds: [1], rowBannerIds: [] }
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
        new Set([5, 6])
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
        new Set([5, 6, 7, 8])
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
        new Set([5, 6, 7, 8])
      ).sections
    ).toEqual([
      { section: FEATURED },
      { section: makeBanner(9) },
      { section: BEST },
      { section: makeBanner(3) },
      { section: makeCategory(4) },
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
      new Set([5, 6, 7, 8])
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

  test("a moved curated row keeps its order, less the articles that are gone, and an article taken out stays out", () => {
    const draft = makeLists({
      featured: [{ productId: 6 }, { productId: 5 }],
      ranking: [{ productId: 8 }],
    });

    const lists = followServerLayout(
      { draft, next: makeLists(), previous: makeLists() },
      new Set([5, 7, 8])
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
