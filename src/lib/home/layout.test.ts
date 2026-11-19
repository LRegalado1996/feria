import { describe, expect, test } from "vitest";

import type { HomeSection } from "@/lib/schemas/home";

import {
  DEFAULT_ROWS_INDEX,
  placeHomeSection,
  resolveHomeSections,
} from "./layout";

const BEST: HomeSection = { kind: "best_sellers" };
const FEATURED: HomeSection = { kind: "featured" };

function makeCategory(categoryId: number): HomeSection {
  return { categoryId, kind: "category" };
}

function makeBanner(bannerId: number): HomeSection {
  return { bannerId, kind: "banner" };
}

describe("resolveHomeSections", () => {
  test("a store that never saved opens on the best sellers, the featured, then its categories and banners in their order", () => {
    expect(
      resolveHomeSections([], { categoryIds: [3, 1], rowBannerIds: [9] })
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
      resolveHomeSections(saved, {
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
      resolveHomeSections([makeCategory(1), FEATURED], {
        categoryIds: [1],
        rowBannerIds: [],
      })
    ).toEqual([BEST, makeCategory(1), FEATURED]);
  });

  test("lists a place given twice once, where it first stood", () => {
    expect(
      resolveHomeSections(
        [makeCategory(1), BEST, makeCategory(1), FEATURED, BEST],
        { categoryIds: [1], rowBannerIds: [] }
      )
    ).toEqual([makeCategory(1), BEST, FEATURED]);
  });
});

describe("placeHomeSection", () => {
  const sections = [BEST, makeCategory(1), FEATURED];

  test.each([
    [0, [makeBanner(4), BEST, makeCategory(1), FEATURED]],
    [1, [BEST, makeBanner(4), makeCategory(1), FEATURED]],
    [3, [BEST, makeCategory(1), FEATURED, makeBanner(4)]],
    // Clamped to the ends.
    [9, [BEST, makeCategory(1), FEATURED, makeBanner(4)]],
    [-2, [makeBanner(4), BEST, makeCategory(1), FEATURED]],
  ])("places a banner at %s", (index, expected) => {
    expect(placeHomeSection(sections, makeBanner(4), index)).toEqual(expected);
  });

  test("takes a banner out of where it was before placing it", () => {
    expect(
      placeHomeSection(
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
