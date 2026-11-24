import { expect, test } from "vitest";

import { RESERVED_CATEGORY_SLUGS } from "@/lib/schemas/catalog";

import {
  ALL_ARTICLES_PATH,
  articlePath,
  CONTACT_PATH,
  categoryPath,
} from "./paths";

test("the contact page is /contacto, an address no category or page can take (FER-080)", () => {
  expect(CONTACT_PATH).toBe("/contacto");
  expect(RESERVED_CATEGORY_SLUGS).toContain(CONTACT_PATH.slice(1));
});

test("the page of all articles is /productos, in either language", () => {
  expect(ALL_ARTICLES_PATH).toBe("/productos");
});

test("an article's page is under all articles', on the same Spanish path in either language", () => {
  expect(articlePath("anillo-sello")).toBe("/productos/anillo-sello");
});

test("no category can take all articles' address, under which the articles live", () => {
  expect(RESERVED_CATEGORY_SLUGS).toContain("productos");
});

test.each([
  [{ parentSlug: "bijouterie", slug: "anillos" }, "/bijouterie/anillos"],
  [{ parentSlug: null, slug: "burbujeros" }, "/burbujeros"],
  [{ parentSlug: null, slug: "bijouterie" }, "/bijouterie"],
])("places %j at %s", (place, expected) => {
  expect(categoryPath(place)).toBe(expected);
});
