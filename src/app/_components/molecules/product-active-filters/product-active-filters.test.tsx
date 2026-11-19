import { fireEvent, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, test } from "vitest";

import type { FilterChip } from "@/lib/admin/product-filters";
import { EMPTY_PRODUCTS_QUERY } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";
import { required } from "@/test/required";

import { ProductActiveFilters } from "./product-active-filters";

function makeChip(overrides: Partial<FilterChip> = {}): FilterChip {
  return {
    filter: "Status",
    id: "status",
    swatchColor: null,
    value: "Draft",
    without: EMPTY_PRODUCTS_QUERY,
    ...overrides,
  };
}

const STATUS = makeChip();
const GOLD = makeChip({
  filter: "Color",
  id: "filter:color:dorado",
  swatchColor: "#c9a227",
  value: "Gold",
});

/** The address a chip leads to: the list without it, named by its id. */
function hrefOf(chip: FilterChip) {
  return `/en/admin/products?without=${chip.id}`;
}

// A chip followed in a test goes nowhere: the list is handed its next chips
// by hand, as the page would hand them over.
function stayOnPage(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest("a[href]")) {
    event.preventDefault();
  }
}

afterEach(() => {
  window.removeEventListener("click", stayOnPage, true);
});

function setup({
  chips = [STATUS, GOLD],
  locale = "en",
}: { chips?: FilterChip[]; locale?: Locale } = {}) {
  const fallbackFocus = createRef<HTMLButtonElement>();
  const ui = (shown: FilterChip[]) => (
    <>
      <button ref={fallbackFocus} type="button">
        Filters
      </button>
      <ProductActiveFilters
        chips={shown}
        className="custom"
        clearHref="/en/admin/products?cleared"
        fallbackFocus={fallbackFocus}
        hrefOf={hrefOf}
      />
    </>
  );
  window.addEventListener("click", stayOnPage, true);
  const view = renderWithI18n(ui(chips), { locale });
  const list = () => screen.getByTestId("product-active-filters");

  return {
    fallback: () => required(fallbackFocus.current),
    /** The first chip's link. */
    firstChip: () => required(within(list()).getAllByRole("link")[0]),
    list,
    rerender: (shown: FilterChip[]) => {
      view.rerender(ui(shown));
    },
  };
}

describe("ProductActiveFilters", () => {
  test("is a named list of chips, each a link to the list without it, then Clear all", () => {
    const { list } = setup();

    expect(list()).toHaveAccessibleName("Active filters");
    expect(list()).toHaveClass("custom");
    expect(
      within(list())
        .getAllByRole("link")
        .map((link) => [
          link.getAttribute("aria-label") ?? link.textContent,
          link.getAttribute("href"),
        ])
    ).toEqual([
      ["Remove filter: Status: Draft", "/en/admin/products?without=status"],
      [
        "Remove filter: Color: Gold",
        "/en/admin/products?without=filter:color:dorado",
      ],
      ["Clear all", "/en/admin/products?cleared"],
    ]);
  });

  test("shows a color value with its swatch, and a value without one with none", () => {
    const { list } = setup();
    const [status, gold] = within(list()).getAllByRole("link");

    expect(
      required(gold).querySelector<HTMLElement>("[aria-hidden]:not(svg)")?.style
        .backgroundColor
    ).toBe("#c9a227");
    expect(required(status).querySelector("[aria-hidden]:not(svg)")).toBeNull();
    expect(gold).toHaveTextContent("Color:Gold");
  });

  test("shows nothing while nothing narrows the list", () => {
    setup({ chips: [] });

    expect(screen.queryByTestId("product-active-filters")).toBeNull();
  });

  test("once a chip is followed and the chips change, focus goes to the first chip left", () => {
    const { firstChip, rerender } = setup();
    fireEvent.click(firstChip());

    rerender([GOLD]);

    expect(
      within(screen.getByTestId("product-active-filters")).getAllByRole(
        "link"
      )[0]
    ).toHaveFocus();
  });

  test("once the last chip is gone, focus goes to the fallback", () => {
    const { fallback, firstChip, rerender } = setup({ chips: [GOLD] });
    fireEvent.click(firstChip());

    rerender([]);

    expect(fallback()).toHaveFocus();
  });

  test("chips that change without a chip followed (another tab, the back button) move no focus", () => {
    const { fallback, rerender } = setup();
    fallback().focus();

    rerender([GOLD]);

    expect(fallback()).toHaveFocus();
    fallback().blur();
    rerender([]);

    expect(document.body).toHaveFocus();
  });

  test.each([
    ["beside the chips", false, {}],
    ["on a chip opened in a new tab", true, { ctrlKey: true }],
    ["on a chip opened in a new window", true, { shiftKey: true }],
  ])(
    "a click %s follows none: chips that change later move no focus",
    (_case, onChip, modifiers) => {
      const { fallback, firstChip, list, rerender } = setup();
      fallback().focus();

      fireEvent.click(
        onChip ? firstChip() : required(list().querySelector("li")),
        modifiers
      );
      rerender([GOLD]);

      expect(fallback()).toHaveFocus();
    }
  );

  test("a render with the same chips after a click keeps waiting for them to change", () => {
    const { fallback, firstChip, rerender } = setup({ chips: [GOLD] });
    fireEvent.click(firstChip());

    rerender([GOLD]);
    rerender([]);

    expect(fallback()).toHaveFocus();
  });

  test("in Spanish, says it in Spanish", () => {
    const { list } = setup({ locale: "es" });

    expect(list()).toHaveAccessibleName("Filtros activos");
    expect(
      within(list()).getByRole("link", {
        name: "Quitar filtro: Status: Draft",
      })
    ).toBeInTheDocument();
    expect(within(list()).getByRole("link", { name: "Limpiar todo" })).toBe(
      screen.getByTestId("product-filters-clear-all")
    );
  });
});
