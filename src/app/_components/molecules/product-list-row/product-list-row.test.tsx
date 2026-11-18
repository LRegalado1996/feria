import { screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { type ProductListItem, ProductListRow } from "./product-list-row";

const UPDATED_AT = new Date("2026-11-15T09:30:00.000Z");
/** Two hours after the article last changed. */
const NOW = Date.parse("2026-11-15T11:30:00.000Z");

function makeItem(overrides: Partial<ProductListItem> = {}): ProductListItem {
  return {
    category: { id: 4, nameEn: "Rings", nameEs: "Anillos" },
    cover: { height: 900, url: "/seed/ring-2.jpg", width: 900 },
    id: 12,
    isAvailable: true,
    priceAmount: 129_000,
    slug: "anillo-de-plata",
    status: "published",
    title: "Anillo de plata",
    titleLang: "es",
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

function setup({
  item = makeItem(),
  locale = "en",
}: { item?: ReturnType<typeof makeItem>; locale?: Locale } = {}) {
  renderWithI18n(
    <table>
      <tbody>
        <ProductListRow
          copy={DICTIONARIES[locale].articles.list}
          currency="UYU"
          href="/en/admin/products/12"
          item={item}
          locale={locale}
          now={NOW}
        />
      </tbody>
    </table>,
    { locale }
  );
  const row = screen.getByTestId(`product-row-${item.id}`);

  return {
    /** Each cell's text, in the row's order, its spaces plain (a price's are not). */
    cells: () =>
      within(row)
        .getAllByRole("cell")
        .map((cell) => cell.textContent.replaceAll(/\s/gu, " ")),
    link: within(row).getByRole("link"),
    row,
  };
}

describe("ProductListRow", () => {
  test("is a row of the list's table: the cover, title, category, price, status and how long ago it changed", () => {
    const { cells, row } = setup();

    expect(row.tagName).toBe("TR");
    expect(row).toHaveAttribute("data-slot", "product-list-row");
    expect(cells()).toEqual([
      "",
      "Anillo de plata",
      "Rings",
      "UYU 1,290",
      "Published",
      "2 hours ago",
    ]);
    expect(
      new URL(
        row.querySelector("img")?.getAttribute("src") ?? "",
        "http://localhost"
      ).searchParams.get("url")
    ).toBe("/seed/ring-2.jpg");
    expect(within(row).getByTestId("product-row-updated")).toHaveAttribute(
      "dateTime",
      "2026-11-15T09:30:00.000Z"
    );
  });

  test("says its table roles outright, which its grid and flex display would drop in WebKit", () => {
    const { row } = setup();

    expect(row).toHaveAttribute("role", "row");
    expect(
      [...row.querySelectorAll("td")].map((cell) => cell.getAttribute("role"))
    ).toEqual(["cell", "cell", "cell", "cell", "cell", "cell"]);
  });

  test("the title is the one link, to the wizard, stretched over the whole row", () => {
    const { link, row } = setup();

    expect(within(row).getAllByRole("link")).toEqual([link]);
    expect(link).toHaveAttribute("href", "/en/admin/products/12");
    expect(link).toHaveAccessibleName("Anillo de plata");
    expect(link).toHaveAttribute("lang", "es");
    expect(link).toHaveAttribute("data-testid", "product-row-title");
    expect(link).toHaveClass("after:absolute", "after:inset-0");
    expect(row).toHaveClass("relative");
  });

  test("names a blank draft for what it is: no title, no photo, no category, no price", () => {
    const { cells, link, row } = setup({
      item: makeItem({
        category: null,
        cover: null,
        priceAmount: null,
        status: "draft",
        title: null,
        titleLang: null,
      }),
    });

    expect(link).toHaveTextContent("Untitled");
    expect(link).not.toHaveAttribute("lang");
    expect(cells().slice(0, 5)).toEqual([
      "No photo",
      "Untitled",
      "No category",
      "No price",
      "Draft",
    ]);
    expect(row.querySelector("img")).toBeNull();
  });

  test.each([
    [true, null],
    [false, "Not available"],
  ])("available %s says so: %s", (isAvailable, said) => {
    const { row } = setup({ item: makeItem({ isAvailable }) });

    expect(
      within(row).queryByTestId("product-row-unavailable")?.textContent ?? null
    ).toBe(said);
  });

  test("names a category without an English name by its Spanish one", () => {
    const { cells } = setup({
      item: makeItem({ category: { id: 4, nameEn: null, nameEs: "Anillos" } }),
    });

    expect(cells()[2]).toBe("Anillos");
  });

  test("in Spanish, says it in Spanish", () => {
    const { cells } = setup({
      item: makeItem({ isAvailable: false, status: "draft" }),
      locale: "es",
    });

    expect(cells()).toEqual([
      "",
      "Anillo de plata",
      "Anillos",
      "$ 1.290",
      "BorradorNo disponible",
      "hace 2 horas",
    ]);
  });
});
