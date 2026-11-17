import { render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";

import { type CatalogQuery, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES } from "@/test/i18n";

import {
  type CatalogCategory,
  type CatalogFilter,
  StoreCatalogFilters,
} from "./store-catalog-filters";

// Whether a link lets Next scroll to the top of the page leaves no trace in
// the anchor it renders: this stand-in writes the `scroll` it was handed on
// its anchor, which is otherwise the same.
vi.mock("next/link", () => ({
  default: ({
    children,
    scroll,
    ...props
  }: ComponentProps<"a"> & { scroll?: boolean }) => (
    <a data-link-scroll={String(scroll)} {...props}>
      {children}
    </a>
  ),
}));

function makeQuery(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { ...EMPTY_CATALOG_QUERY, ...overrides };
}

const CATEGORIES: CatalogCategory[] = [
  {
    depth: 0,
    lang: "es",
    name: "Collares",
    path: "/collares",
    slug: "collares",
  },
  {
    depth: 1,
    lang: "en",
    name: "Rings",
    path: "/collares/anillos",
    slug: "anillos",
  },
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
      idPrefix="panel"
      locale={locale}
      query={query}
    />
  );

  /** The choices in a group, as name, address and whether it is chosen. */
  const choicesIn = (scope: HTMLElement) =>
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

  return {
    choicesIn,
    group,
    root: container.querySelector('[data-slot="store-catalog-filters"]'),
  };
}

describe("StoreCatalogFilters", () => {
  test("lists the categories after All, keeping the rest of the selection", () => {
    const { choicesIn } = setup();

    const nav = screen.getByRole("navigation", { name: "Categorías" });
    expect(choicesIn(nav)).toEqual([
      ["Todas", "/productos?sort=price_asc", "true"],
      ["Collares", "/collares?sort=price_asc", null],
      ["Rings", "/collares/anillos?sort=price_asc", null],
    ]);
    expect(within(nav).getByRole("link", { name: "Rings" })).toHaveAttribute(
      "lang",
      "en"
    );
  });

  test("marks the chosen category, whose link takes it out again", () => {
    const { choicesIn } = setup({
      locale: "en",
      query: makeQuery({ category: { path: "/collares", slug: "collares" } }),
    });

    expect(
      choicesIn(screen.getByRole("navigation", { name: "Categories" }))
    ).toEqual([
      ["All", "/en/productos", null],
      ["Collares", "/en/productos", "true"],
      ["Rings", "/en/collares/anillos", null],
    ]);
  });

  test("sets a group's categories one step in, under it (FER-043)", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Categorías" });

    expect(
      within(nav)
        .getAllByRole("listitem")
        .map((item) => [item.textContent, item.className])
    ).toEqual([
      ["Todas", ""],
      ["Collares", ""],
      ["Rings", "pl-8"],
    ]);
  });

  test("leaves the categories out for a store with none", () => {
    const { root } = setup({ categories: [] });

    expect(screen.queryByRole("navigation")).toBeNull();
    expect(root?.querySelector("#panel-categories")).toBeNull();
  });

  test("lists each filter's values under its heading, with their counts, as toggles", () => {
    const { choicesIn, group } = setup({
      query: makeQuery({
        filters: [{ attribute: "color", values: ["dorado"] }],
      }),
    });

    expect(choicesIn(group("panel-color"))).toEqual([
      ["Dorado4", "/productos", "true"],
      ["Plateado1", "/productos?color=dorado,plateado", null],
    ]);
    expect(choicesIn(group("panel-talle"))).toEqual([
      ["M3", "/productos?color=dorado&talle=m", null],
    ]);
    expect(screen.getByRole("list", { name: "Color" }).closest("div")).toBe(
      group("panel-color")
    );
  });

  test("names every group by its prefix and filter, in the language it is in, under the panel's title", () => {
    const { root } = setup();

    expect(
      [...(root?.querySelectorAll("h3") ?? [])].map((heading) => [
        heading.id,
        heading.textContent,
        heading.getAttribute("lang"),
      ])
    ).toEqual([
      ["panel-categories", "Categorías", null],
      ["panel-color", "Color", "es"],
      ["panel-talle", "Size", "en"],
    ]);
    expect(root?.querySelector("h2")).toBeNull();
  });

  test("ticks the box of a chosen choice only", () => {
    const { group } = setup({
      query: makeQuery({
        filters: [{ attribute: "color", values: ["dorado"] }],
      }),
    });

    const [dorado, plateado] = within(group("panel-color")).getAllByRole(
      "link"
    );
    const box = (link: HTMLElement | undefined) =>
      link?.querySelector('[data-slot="store-catalog-choice-box"]');
    expect(dorado).toHaveAttribute("data-chosen", "true");
    expect(box(dorado)).toHaveClass("bg-store-foreground");
    expect(box(dorado)?.querySelector("svg")).not.toBeNull();
    expect(plateado).toHaveAttribute("data-chosen", "false");
    expect(box(plateado)).not.toHaveClass("bg-store-foreground");
    expect(box(plateado)?.querySelector("svg")).toBeNull();
    expect(box(dorado)).toHaveAttribute("aria-hidden", "true");
  });

  test("marks each value with its language, and a round swatch only where it has one", () => {
    const { group } = setup();

    const dorado = within(group("panel-color")).getByRole("link", {
      name: "Dorado 4",
    });
    const swatch = dorado.querySelector(
      '[data-slot="store-catalog-choice-swatch"]'
    );
    expect(swatch).toHaveStyle({ backgroundColor: "#d4af37" });
    expect(swatch).toHaveClass("rounded-full");
    expect(swatch).toHaveAttribute("aria-hidden", "true");
    expect(dorado).toHaveAttribute("lang", "es");
    expect(
      within(group("panel-color"))
        .getByRole("link", { name: "Plateado 1" })
        .querySelector('[data-slot="store-catalog-choice-swatch"]')
    ).toBeNull();
    expect(
      within(group("panel-talle")).getByRole("link", { name: "M 3" })
    ).toHaveAttribute("lang", "en");
  });

  test("shows each count muted, and none for All", () => {
    const { group } = setup();

    const counts = within(group("panel-color"))
      .getAllByText(/^\d+$/u)
      .map((count) => [count.textContent, count.className]);
    expect(counts).toEqual([
      ["4", "text-xs text-store-muted tabular-nums"],
      ["1", "text-xs text-store-muted tabular-nums"],
    ]);
    expect(screen.getByRole("link", { name: "Todas" }).textContent).toBe(
      "Todas"
    );
  });

  test("each choice is a row a thumb can tap", () => {
    setup();

    const choice = screen.getByRole("link", { name: "Collares" });
    expect(choice).toHaveClass(
      "min-h-11",
      "focus-visible:outline-store-foreground"
    );
  });

  test("every choice, a category or a filter's value, keeps the page where it is instead of scrolling to its top", () => {
    const { root } = setup();

    expect(
      [
        ...(root?.querySelectorAll<HTMLElement>(
          '[data-slot="store-catalog-choice"]'
        ) ?? []),
      ].map((choice) => [choice.textContent, choice.dataset.linkScroll])
    ).toEqual([
      ["Todas", "false"],
      ["Collares", "false"],
      ["Rings", "false"],
      ["Dorado4", "false"],
      ["Plateado1", "false"],
      ["M3", "false"],
    ]);
  });

  test("keeps a caller's class", () => {
    const { root } = setup();

    expect(root).toHaveClass("custom", "flex");
  });
});
