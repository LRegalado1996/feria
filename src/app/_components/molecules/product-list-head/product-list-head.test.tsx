import { screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { EMPTY_PRODUCTS_QUERY, type ProductsQuery } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ProductListHead } from "./product-list-head";

function makeQuery(overrides: Partial<ProductsQuery> = {}): ProductsQuery {
  return { ...EMPTY_PRODUCTS_QUERY, ...overrides };
}

function setup({
  locale = "en",
  query = makeQuery(),
}: { locale?: Locale; query?: ProductsQuery } = {}) {
  renderWithI18n(
    <table>
      <ProductListHead query={query} />
    </table>,
    { locale }
  );
  const head = screen.getByTestId("product-list-columns");

  return {
    /** Each column header's name, order and the address its link leads to. */
    columns: () =>
      within(head)
        .getAllByRole("columnheader")
        .map((header) => [
          header.textContent,
          header.getAttribute("aria-sort"),
          header.querySelector("a")?.getAttribute("href") ?? null,
        ]),
    head,
    link: (sort: string) => screen.getByTestId(`sort-${sort}`),
  };
}

describe("ProductListHead", () => {
  test("names every column, the photo's for the ear, and says the default order is by the last change, newest first", () => {
    const { columns } = setup();

    expect(columns()).toEqual([
      ["Photo", null, null],
      ["Article", "none", "/en/admin/products?sort=title"],
      ["Category", "none", "/en/admin/products?sort=category"],
      ["Price", "none", "/en/admin/products?sort=price"],
      ["Status", "none", "/en/admin/products?sort=status"],
      ["Updated", "descending", "/en/admin/products?dir=asc"],
      // The rows' menus (FER-019): named for the ear, not sortable.
      ["Actions", null, null],
    ]);
  });

  test("a click on the column sorting now turns it round; another column starts at its own first direction", () => {
    const { columns } = setup({
      query: makeQuery({ dir: "asc", page: 4, q: "anillo", sort: "price" }),
    });

    expect(columns().slice(1)).toEqual([
      ["Article", "none", "/en/admin/products?q=anillo&sort=title"],
      ["Category", "none", "/en/admin/products?q=anillo&sort=category"],
      ["Price", "ascending", "/en/admin/products?q=anillo&sort=price&dir=desc"],
      ["Status", "none", "/en/admin/products?q=anillo&sort=status"],
      ["Updated", "none", "/en/admin/products?q=anillo"],
      ["Actions", null, null],
    ]);
  });

  test("each link's name says the order following it gives", () => {
    const { link } = setup({
      query: makeQuery({ dir: "desc", sort: "title" }),
    });

    expect(link("title")).toHaveAccessibleName("Sort: Article, A to Z");
    expect(link("price")).toHaveAccessibleName("Sort: Price, low to high");
    expect(link("updated")).toHaveAccessibleName("Sort: Updated, newest first");
  });

  test.each([
    ["en", "asc"],
    ["en", "desc"],
    ["es", "asc"],
    ["es", "desc"],
  ] as const)(
    "in %s, sorted %s, every link's name holds the column's visible name (WCAG 2.5.3)",
    (locale, dir) => {
      setup({ locale, query: makeQuery({ dir, sort: "title" }) });

      for (const sort of ["title", "category", "price", "status", "updated"]) {
        const link = screen.getByTestId(`sort-${sort}`);

        expect(link.getAttribute("aria-label")).toContain(link.textContent);
      }
    }
  );

  test.each([
    ["asc", "lucide-arrow-up"],
    ["desc", "lucide-arrow-down"],
  ] as const)(
    "the column sorting %s shows its arrow, the others a faint one",
    (dir, arrow) => {
      const { link } = setup({ query: makeQuery({ dir, sort: "category" }) });

      expect(link("category").querySelector("svg")).toHaveClass(arrow);
      expect(link("category")).toHaveClass("font-medium");
      expect(link("status").querySelector("svg")).toHaveClass(
        "lucide-chevrons-up-down",
        "opacity-0"
      );
      expect(link("status")).not.toHaveClass("font-medium");
    }
  );

  test("says its table roles outright, which its block and grid display would drop in WebKit", () => {
    const { head } = setup({
      query: makeQuery({ dir: "asc", sort: "price" }),
    });
    const row = head.querySelector("tr");

    expect([head.getAttribute("role"), row?.getAttribute("role")]).toEqual([
      "rowgroup",
      "row",
    ]);
    expect(
      [...head.querySelectorAll("th")].map((header) => [
        header.getAttribute("role"),
        header.getAttribute("aria-sort"),
      ])
    ).toEqual([
      ["columnheader", null],
      ["columnheader", "none"],
      ["columnheader", "none"],
      ["columnheader", "ascending"],
      ["columnheader", "none"],
      ["columnheader", "none"],
      ["columnheader", null],
    ]);
  });

  test("aligns the price's name with its figures, on the right", () => {
    const { head } = setup();
    const headers = within(head).getAllByRole("columnheader");

    expect(
      headers.map((header) => header.classList.contains("text-right"))
    ).toEqual([false, false, false, true, false, false, false]);
  });

  test("in Spanish, says it in Spanish", () => {
    const { columns, link } = setup({ locale: "es" });

    expect(columns().map(([name]) => name)).toEqual([
      "Foto",
      "Artículo",
      "Categoría",
      "Precio",
      "Estado",
      "Modificado",
      "Acciones",
    ]);
    expect(link("price")).toHaveAccessibleName(
      "Ordenar: Precio, de menor a mayor"
    );
    expect(link("price")).toHaveAttribute("href", "/admin/products?sort=price");
  });
});
