import { screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import { type ProductListItem, ProductListRow } from "./product-list-row";

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
    updatedAt: new Date("2026-11-15T09:30:00.000Z"),
    ...overrides,
  };
}

function setup({
  item = makeItem(),
  locale = "en",
}: { item?: ReturnType<typeof makeItem>; locale?: Locale } = {}) {
  renderWithI18n(
    <ul>
      <ProductListRow
        copy={DICTIONARIES[locale].articles.list}
        currency="UYU"
        href="/en/admin/products/12"
        item={item}
        locale={locale}
      />
    </ul>,
    { locale }
  );
  const row = screen.getByTestId(`product-row-${item.id}`);

  return { link: within(row).getByRole("link"), row: within(row) };
}

describe("ProductListRow", () => {
  test("is one link to the wizard with the cover, title, category, price and status", () => {
    const { link, row } = setup();

    expect(link).toHaveAttribute("href", "/en/admin/products/12");
    expect(row.getByTestId("product-row-title")).toHaveTextContent(
      "Anillo de plata"
    );
    expect(row.getByTestId("product-row-title")).toHaveAttribute("lang", "es");
    expect(link).toHaveTextContent("Rings");
    expect(link).toHaveTextContent("UYU 1,290");
    expect(row.getByTestId("product-row-status")).toHaveTextContent(
      "Published"
    );
    expect(row.queryByTestId("product-row-unavailable")).toBeNull();
    expect(
      new URL(
        link.querySelector("img")?.getAttribute("src") ?? "",
        "http://localhost"
      ).searchParams.get("url")
    ).toBe("/seed/ring-2.jpg");
  });

  test("names a blank draft for what it is: no title, no photo, no category, no price", () => {
    const { link, row } = setup({
      item: makeItem({
        category: null,
        cover: null,
        priceAmount: null,
        status: "draft",
        title: null,
        titleLang: null,
      }),
    });

    expect(row.getByTestId("product-row-title")).toHaveTextContent("Untitled");
    expect(row.getByTestId("product-row-title")).not.toHaveAttribute("lang");
    expect(link).toHaveTextContent("No photo");
    expect(link).toHaveTextContent("No category");
    expect(link).toHaveTextContent("No price");
    expect(link.querySelector("img")).toBeNull();
    expect(row.getByTestId("product-row-status")).toHaveTextContent("Draft");
  });

  test.each([
    [true, null],
    [false, "Not available"],
  ])("available %s says so: %s", (isAvailable, said) => {
    const { row } = setup({ item: makeItem({ isAvailable }) });

    expect(
      row.queryByTestId("product-row-unavailable")?.textContent ?? null
    ).toBe(said);
  });

  test("names a category without an English name by its Spanish one", () => {
    const { link } = setup({
      item: makeItem({ category: { id: 4, nameEn: null, nameEs: "Anillos" } }),
    });

    expect(link).toHaveTextContent("Anillos");
  });

  test("in Spanish, says it in Spanish", () => {
    const { link, row } = setup({
      item: makeItem({ isAvailable: false, status: "draft" }),
      locale: "es",
    });

    expect(link).toHaveTextContent("Anillos");
    expect(link).toHaveTextContent("$ 1.290");
    expect(row.getByTestId("product-row-status")).toHaveTextContent("Borrador");
    expect(row.getByTestId("product-row-unavailable")).toHaveTextContent(
      "No disponible"
    );
  });
});
