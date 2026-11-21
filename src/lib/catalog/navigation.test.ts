import { describe, expect, test } from "vitest";

import {
  catalogNavigation,
  headerCategories,
  type NavigationCategory,
  navigationOrder,
} from "./navigation";

function makeCategory(
  overrides: Partial<NavigationCategory> & Pick<NavigationCategory, "id">
): NavigationCategory {
  const slug = overrides.slug ?? `categoria-${overrides.id}`;

  return {
    lang: "es",
    name: slug,
    parentId: null,
    path: `/${slug}`,
    slug,
    ...overrides,
  };
}

// LR Market's catalog (FER-043), in the store's order.
const BIJOUTERIE = makeCategory({ id: 6, slug: "bijouterie" });
const BUBBLES = makeCategory({ id: 1, slug: "burbujeros" });
const CHAINS = makeCategory({
  id: 2,
  parentId: 6,
  path: "/bijouterie/cadenas",
  slug: "cadenas",
});
const RINGS = makeCategory({
  id: 3,
  parentId: 6,
  path: "/bijouterie/anillos",
  slug: "anillos",
});
const STORE = [BIJOUTERIE, CHAINS, BUBBLES, RINGS];

test("lists the categories in no group, each group holding its own in the store's order", () => {
  expect(catalogNavigation(STORE)).toEqual([
    { ...BIJOUTERIE, children: [CHAINS, RINGS] },
    { ...BUBBLES, children: [] },
  ]);
});

test("shows a category whose group is missing at the top, not nowhere", () => {
  const orphan = makeCategory({ id: 9, parentId: 99, slug: "aros" });

  expect(catalogNavigation([orphan])).toEqual([{ ...orphan, children: [] }]);
});

test("is empty for a store without categories", () => {
  expect(catalogNavigation([])).toEqual([]);
});

test("lays a group's categories right after it, one level in", () => {
  expect(
    navigationOrder(STORE).map((entry) => [entry.slug, entry.depth])
  ).toEqual([
    ["bijouterie", 0],
    ["cadenas", 1],
    ["anillos", 1],
    ["burbujeros", 0],
  ]);
});

describe("headerCategories", () => {
  const shown = (category: NavigationCategory, showInHeader = true) => ({
    ...category,
    showInHeader,
  });

  test("keeps every category the admin left in the header, in their order", () => {
    const store = STORE.map((category) => shown(category));

    expect(headerCategories(store)).toEqual(store);
  });

  test("drops a category in no group the admin took out of the header", () => {
    const store = [shown(BIJOUTERIE), shown(CHAINS), shown(BUBBLES, false)];

    expect(headerCategories(store)).toEqual([shown(BIJOUTERIE), shown(CHAINS)]);
  });

  test("drops a hidden group with all its categories, whatever theirs say", () => {
    const store = [
      shown(BIJOUTERIE, false),
      shown(CHAINS),
      shown(BUBBLES),
      shown(RINGS),
    ];

    expect(headerCategories(store)).toEqual([shown(BUBBLES)]);
  });

  test("keeps a category in a shown group even when its own choice is off", () => {
    const store = [shown(BIJOUTERIE), shown(CHAINS, false)];

    expect(headerCategories(store)).toEqual(store);
  });

  test("reads a category whose group is missing as top-level, by its own choice", () => {
    expect(headerCategories([shown(CHAINS, false), shown(RINGS)])).toEqual([
      shown(RINGS),
    ]);
  });
});
