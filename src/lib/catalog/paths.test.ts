import { expect, test } from "vitest";

import { ALL_ARTICLES_PATH, categoryPath } from "./paths";

test("the page of all articles is /productos, in either language", () => {
  expect(ALL_ARTICLES_PATH).toBe("/productos");
});

test.each([
  [{ parentSlug: "bijouterie", slug: "anillos" }, "/bijouterie/anillos"],
  [{ parentSlug: null, slug: "burbujeros" }, "/burbujeros"],
  [{ parentSlug: null, slug: "bijouterie" }, "/bijouterie"],
])("places %j at %s", (place, expected) => {
  expect(categoryPath(place)).toBe(expected);
});
