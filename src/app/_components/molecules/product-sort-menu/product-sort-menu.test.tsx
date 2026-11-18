import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { EMPTY_PRODUCTS_QUERY, type ProductsQuery } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ProductSortMenu } from "./product-sort-menu";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function makeQuery(overrides: Partial<ProductsQuery> = {}): ProductsQuery {
  return { ...EMPTY_PRODUCTS_QUERY, ...overrides };
}

function setup({
  locale = "en",
  query = makeQuery(),
}: { locale?: Locale; query?: ProductsQuery } = {}) {
  const user = userEvent.setup();
  const view = renderWithI18n(
    <ProductSortMenu className="xl:hidden" query={query} />,
    { locale }
  );
  const button = screen.getByTestId("product-sort-button");

  return {
    button,
    container: view.container,
    open: async () => {
      await user.click(button);
      return screen.getByRole("menu");
    },
    user,
  };
}

describe("ProductSortMenu", () => {
  test("offers every order, each column's first direction first, the current one checked", async () => {
    const { open } = setup({
      query: makeQuery({ dir: "desc", sort: "price" }),
    });

    await open();

    expect(
      screen
        .getAllByRole("menuitemradio")
        .map((item) => [item.textContent, item.getAttribute("aria-checked")])
    ).toEqual([
      ["Updated, newest first", "false"],
      ["Updated, oldest first", "false"],
      ["Title, A to Z", "false"],
      ["Title, Z to A", "false"],
      ["Category, A to Z", "false"],
      ["Category, Z to A", "false"],
      ["Price, low to high", "false"],
      ["Price, high to low", "true"],
      ["Status, drafts first", "false"],
      ["Status, published first", "false"],
    ]);
  });

  test("choosing an order puts it in the address from the first page, keeping the search and filters", async () => {
    const { open, user } = setup({
      query: makeQuery({ page: 3, q: "anillo", status: "draft" }),
    });
    await open();

    await user.click(
      screen.getByRole("menuitemradio", { name: "Price, high to low" })
    );

    expect(push).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?q=anillo&status=draft&sort=price&dir=desc",
      { scroll: false }
    );
  });

  test("choosing a column's first direction leaves the direction out of the address", async () => {
    const { open, user } = setup();
    await open();

    await user.click(
      screen.getByRole("menuitemradio", { name: "Title, A to Z" })
    );

    expect(push).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?sort=title",
      { scroll: false }
    );
  });

  test("is an outlined Sort button described by the current order, its wrapper taking the caller's class", () => {
    const { button, container } = setup({
      query: makeQuery({ dir: "asc", sort: "status" }),
    });

    expect(button).toHaveAccessibleName("Sort");
    expect(button).toHaveAccessibleDescription(
      "Current order: Status, drafts first"
    );
    expect(container.firstElementChild).toHaveAttribute(
      "data-slot",
      "product-sort-menu"
    );
    expect(container.firstElementChild).toHaveClass("contents", "xl:hidden");
  });

  test("in Spanish, says it in Spanish", async () => {
    const { button, open, user } = setup({ locale: "es" });

    expect(button).toHaveAccessibleName("Ordenar");
    expect(button).toHaveAccessibleDescription(
      "Orden actual: Modificado, los más recientes primero"
    );
    await open();
    await user.click(
      screen.getByRole("menuitemradio", { name: "Precio, de menor a mayor" })
    );

    expect(push).toHaveBeenCalledExactlyOnceWith("/admin/products?sort=price", {
      scroll: false,
    });
  });
});
