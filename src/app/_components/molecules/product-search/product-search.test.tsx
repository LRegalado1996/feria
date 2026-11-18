import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { EMPTY_PRODUCTS_QUERY, type ProductsQuery } from "@/lib/admin/products";
import { SEARCH_DEBOUNCE_MS } from "@/lib/hooks/ui";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { ProductSearch } from "./product-search";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

/** A selection on page 3, filtered to drafts in rings, by price. */
function makeQuery(overrides: Partial<ProductsQuery> = {}): ProductsQuery {
  return {
    ...EMPTY_PRODUCTS_QUERY,
    categories: ["anillos"],
    dir: "asc",
    page: 3,
    sort: "price",
    status: "draft",
    ...overrides,
  };
}

function setup({
  locale = "en",
  query = makeQuery(),
}: { locale?: Locale; query?: ProductsQuery } = {}) {
  vi.useFakeTimers();
  const view = renderWithI18n(
    <ProductSearch className="custom" query={query} />,
    { locale }
  );
  const field = () =>
    screen.getByRole("searchbox", {
      name: locale === "es" ? "Buscar artículos" : "Search articles",
    });

  return {
    advance: (ms: number) => {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    },
    container: view.container,
    field,
    type: (text: string) => {
      field().focus();
      fireEvent.change(field(), { target: { value: text } });
    },
  };
}

describe("ProductSearch", () => {
  test("once typing pauses, replaces the address with the search from the first page, keeping the filters and the order", () => {
    const { advance, type } = setup();

    type("anillo");
    advance(SEARCH_DEBOUNCE_MS - 1);

    expect(replace).not.toHaveBeenCalled();

    advance(1);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?q=anillo&status=draft&category=anillos&sort=price",
      { scroll: false }
    );
  });

  test("a search cleared to blank takes q out of the address", () => {
    const { advance, type } = setup({
      query: makeQuery({ page: 1, q: "anillo" }),
    });

    type("  ");
    advance(SEARCH_DEBOUNCE_MS);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?status=draft&category=anillos&sort=price",
      { scroll: false }
    );
  });

  test("submitting searches at once", () => {
    const { field, type } = setup({ query: EMPTY_PRODUCTS_QUERY });

    type("aros");
    fireEvent.submit(field());

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?q=aros",
      { scroll: false }
    );
  });

  test("the clear button empties the field and the search at once, and keeps focus in the field", () => {
    const { field } = setup({ query: makeQuery({ q: "anillo" }) });
    const clear = screen.getByRole("button", { name: "Clear the search" });

    fireEvent.click(clear);

    expect(field()).toHaveValue("");
    expect(field()).toHaveFocus();
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?status=draft&category=anillos&sort=price",
      { scroll: false }
    );
    expect(
      screen.queryByRole("button", { name: "Clear the search" })
    ).toBeNull();
  });

  test("offers no clear button while the field is empty", () => {
    setup({ query: EMPTY_PRODUCTS_QUERY });

    expect(
      screen.queryByRole("button", { name: "Clear the search" })
    ).toBeNull();
  });

  test("without the script, is a GET form to the list carrying the rest of the selection, from the first page", () => {
    const { container, field } = setup({ query: makeQuery({ q: "anillo" }) });
    const form = field().closest("form");

    expect(form).toHaveAttribute("action", "/en/admin/products");
    expect(field()).toHaveAttribute("name", "q");
    expect(field()).toHaveValue("anillo");
    expect(field()).toHaveAttribute("maxlength", "100");
    expect(
      [...container.querySelectorAll("input[type=hidden]")].map((input) => [
        input.getAttribute("name"),
        input.getAttribute("value"),
      ])
    ).toEqual([
      ["status", "draft"],
      ["category", "anillos"],
      ["sort", "price"],
    ]);
    expect(container.firstElementChild).toHaveClass("custom");
  });

  test("in Spanish, says it in Spanish", () => {
    const { advance, field, type } = setup({
      locale: "es",
      query: EMPTY_PRODUCTS_QUERY,
    });

    expect(field()).toHaveAttribute("placeholder", "Buscar por título…");

    type("ñandú");
    advance(SEARCH_DEBOUNCE_MS);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/admin/products?q=%C3%B1and%C3%BA",
      { scroll: false }
    );
    expect(
      screen.getByRole("button", { name: "Borrar la búsqueda" })
    ).toBeInTheDocument();
  });
});
