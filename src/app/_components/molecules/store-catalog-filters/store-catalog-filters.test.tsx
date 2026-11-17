import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { type CatalogQuery, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import {
  type CatalogCategory,
  type CatalogFilter,
  StoreCatalogFilters,
} from "./store-catalog-filters";

function makeQuery(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { ...EMPTY_CATALOG_QUERY, ...overrides };
}

const CATEGORIES: CatalogCategory[] = [
  { lang: "es", name: "Collares", slug: "collares" },
  { lang: "en", name: "Rings", slug: "anillos" },
];

function makeValue(
  slug: string,
  name: string,
  overrides: Partial<CatalogFilter["values"][number]> = {}
) {
  return { count: 3, lang: "es", name, slug, swatchColor: null, ...overrides };
}

const FILTERS: CatalogFilter[] = [
  {
    lang: "es",
    name: "Color",
    slug: "color",
    values: [
      makeValue("dorado", "Dorado", { count: 4, swatchColor: "#d4af37" }),
      makeValue("plateado", "Plateado", { count: 1 }),
    ],
  },
  {
    lang: "en",
    name: "Size",
    slug: "talle",
    values: [makeValue("m", "M", { lang: "en" })],
  },
];

function setup({
  categories = CATEGORIES,
  locale = "es",
  query = makeQuery({ sort: "price_asc" }),
}: {
  categories?: CatalogCategory[];
  locale?: Locale;
  query?: CatalogQuery;
} = {}) {
  const { container } = render(
    <StoreCatalogFilters
      categories={categories}
      className="custom"
      copy={DICTIONARIES[locale].storefront.catalog}
      filters={FILTERS}
      idPrefix="sidebar"
      locale={locale}
      query={query}
    />
  );

  /** The links in a group, as name, address and whether it is the current one. */
  const linksIn = (scope: HTMLElement) =>
    within(scope)
      .getAllByRole("link")
      .map((link) => [
        link.textContent,
        link.getAttribute("href"),
        link.getAttribute("aria-current"),
      ]);
  const group = (headingId: string) => {
    const heading = container.querySelector(`#${headingId}`);
    const scope = heading?.parentElement;

    if (!(scope instanceof HTMLElement)) {
      throw new TypeError(`No group headed ${headingId}`);
    }

    return scope;
  };

  return { container, group, linksIn };
}

describe("StoreCatalogFilters", () => {
  test("lists the categories after All, keeping the rest of the selection", () => {
    const { linksIn } = setup();

    const nav = screen.getByRole("navigation", { name: "Categorías" });
    expect(linksIn(nav)).toEqual([
      ["Todas", "/products?sort=price_asc", "true"],
      ["Collares", "/products?category=collares&sort=price_asc", null],
      ["Rings", "/products?category=anillos&sort=price_asc", null],
    ]);
    expect(within(nav).getByRole("link", { name: "Rings" })).toHaveAttribute(
      "lang",
      "en"
    );
  });

  test("marks the chosen category, whose link takes it out again", () => {
    const { linksIn } = setup({
      locale: "en",
      query: makeQuery({ category: "collares" }),
    });

    expect(
      linksIn(screen.getByRole("navigation", { name: "Categories" }))
    ).toEqual([
      ["All", "/en/products", null],
      ["Collares", "/en/products", "true"],
      ["Rings", "/en/products?category=anillos", null],
    ]);
  });

  test("leaves the categories out for a store with none", () => {
    const { container } = setup({ categories: [] });

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.querySelector("#sidebar-categories")).toBeNull();
  });

  test("lists each filter's values under its heading, with their counts, as toggles", () => {
    const { group, linksIn } = setup({
      query: makeQuery({
        filters: [{ attribute: "color", values: ["dorado"] }],
      }),
    });

    expect(linksIn(group("sidebar-color"))).toEqual([
      ["Dorado(4)", "/products", "true"],
      ["Plateado(1)", "/products?color=dorado,plateado", null],
    ]);
    expect(linksIn(group("sidebar-talle"))).toEqual([
      ["M(3)", "/products?color=dorado&talle=m", null],
    ]);
  });

  test("names every heading by its prefix and filter, in the language it is in", () => {
    const { container } = setup();

    expect(
      [...container.querySelectorAll("h2")].map((heading) => [
        heading.id,
        heading.textContent,
        heading.getAttribute("lang"),
      ])
    ).toEqual([
      ["sidebar-categories", "Categorías", null],
      ["sidebar-color", "Color", "es"],
      ["sidebar-talle", "Size", "en"],
    ]);
  });

  test("marks each value with its language, and a swatch only where it has one", () => {
    const { group } = setup();

    const dorado = within(group("sidebar-color")).getByRole("link", {
      name: "Dorado (4)",
    });
    const swatch = dorado.querySelector('[aria-hidden="true"]');
    expect(swatch).toHaveStyle({ backgroundColor: "#d4af37" });
    expect(dorado).toHaveAttribute("lang", "es");
    expect(
      within(group("sidebar-color"))
        .getByRole("link", { name: "Plateado (1)" })
        .querySelector('[aria-hidden="true"]')
    ).toBeNull();
    expect(
      within(group("sidebar-talle")).getByRole("link", { name: "M (3)" })
    ).toHaveAttribute("lang", "en");
  });

  test("mutes the count of a value not chosen", () => {
    const { group } = setup({
      query: makeQuery({
        filters: [{ attribute: "color", values: ["dorado"] }],
      }),
    });

    const counts = within(group("sidebar-color"))
      .getAllByText(/^\(\d+\)$/u)
      .map((count) => count.className);
    expect(counts).toEqual(["", "text-store-muted"]);
  });
});
