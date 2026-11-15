import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { type CatalogQuery, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import { renderWithI18n } from "@/test/i18n";

import { SEARCH_DEBOUNCE_MS, StoreCatalogSearch } from "./store-catalog-search";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function makeQuery(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { ...EMPTY_CATALOG_QUERY, ...overrides };
}

/** A selection with a category, a filter and a sort, to carry along. */
const SELECTION = makeQuery({
  category: "collares",
  filters: [{ attribute: "color", values: ["dorado", "plateado"] }],
  sort: "price_asc",
});

function setup({
  locale = "es",
  query = SELECTION,
}: { locale?: Locale; query?: CatalogQuery } = {}) {
  vi.useFakeTimers();
  const view = renderWithI18n(
    <StoreCatalogSearch
      className="custom"
      query={query}
      storeSlug="lr-market"
    />,
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
    field,
    form: () => {
      const form = field().closest("form");

      if (!form) {
        throw new Error("No form");
      }

      return form;
    },
    /** Types into the field as the browser reports it: one change event. */
    type: (text: string) => {
      field().focus();
      fireEvent.change(field(), { target: { value: text } });
    },
    unmount: () => {
      view.unmount();
    },
    rerender: (next: CatalogQuery) => {
      view.rerender(
        <StoreCatalogSearch
          className="custom"
          query={next}
          storeSlug="lr-market"
        />
      );
    },
  };
}

describe("StoreCatalogSearch", () => {
  test("waits for typing to pause, then replaces the address with the search, keeping the rest", () => {
    const { advance, type } = setup();

    type("perla");
    advance(SEARCH_DEBOUNCE_MS - 1);

    expect(SEARCH_DEBOUNCE_MS).toBe(300);
    expect(replace).not.toHaveBeenCalled();

    advance(1);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/lr-market/products?category=collares&color=dorado,plateado&q=perla&sort=price_asc",
      { scroll: false }
    );
  });

  test("navigates nowhere once unmounted, though typing had not paused yet", () => {
    const { advance, type, unmount } = setup();

    type("perla");
    advance(SEARCH_DEBOUNCE_MS - 1);
    unmount();
    advance(SEARCH_DEBOUNCE_MS);

    expect(replace).not.toHaveBeenCalled();
  });

  test("sends the search trimmed, once, after the last keystroke", () => {
    const { advance, type } = setup({ locale: "en", query: makeQuery() });

    type("a");
    advance(SEARCH_DEBOUNCE_MS - 1);
    type(" aro ");
    advance(SEARCH_DEBOUNCE_MS);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/en/lr-market/products?q=aro",
      { scroll: false }
    );
  });

  test("a search cleared to blank takes q out of the address", () => {
    const { advance, type } = setup({
      query: makeQuery({ category: "aros", q: "perla" }),
    });

    type("   ");
    advance(SEARCH_DEBOUNCE_MS);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/lr-market/products?category=aros",
      { scroll: false }
    );
  });

  test("submitting searches at once, and the pending wait sends nothing more", () => {
    const { advance, form, type } = setup({ query: makeQuery() });

    type("aro");
    fireEvent.submit(form());

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/lr-market/products?q=aro",
      { scroll: false }
    );

    advance(SEARCH_DEBOUNCE_MS);

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/lr-market/products?q=aro",
      { scroll: false }
    );
  });

  test("submitting with nothing pending searches what the field holds", () => {
    const { form } = setup({ query: makeQuery({ q: "perla" }) });

    fireEvent.submit(form());

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      "/lr-market/products?q=perla",
      { scroll: false }
    );
  });

  test("keeps focus and what was typed when the address catches up with it", () => {
    const { advance, field, rerender, type } = setup({ query: makeQuery() });
    type("perla");
    advance(SEARCH_DEBOUNCE_MS);
    const input = field();
    // Sent, and still shown while the address is on its way.
    expect(input).toHaveValue("perla");

    rerender(makeQuery({ q: "perla" }));

    expect(field()).toBe(input);
    expect(input).toHaveFocus();
    expect(input).toHaveValue("perla");
  });

  test("keeps typing that ran ahead of the address", () => {
    const { advance, field, rerender, type } = setup({ query: makeQuery() });
    type("perla");
    advance(SEARCH_DEBOUNCE_MS);
    type("perla fina");

    rerender(makeQuery({ q: "perla" }));

    expect(field()).toHaveValue("perla fina");
  });

  test("keeps the field while the address catches up with two searches in turn", () => {
    const { advance, field, rerender, type } = setup({ query: makeQuery() });
    type("perla");
    advance(SEARCH_DEBOUNCE_MS);
    type("perla fina");
    advance(SEARCH_DEBOUNCE_MS);
    type("perla fina y");

    rerender(makeQuery({ q: "perla" }));
    expect(field()).toHaveValue("perla fina y");

    rerender(makeQuery({ q: "perla fina" }));
    expect(field()).toHaveValue("perla fina y");
  });

  test("after catching up, a search from elsewhere replaces the field again", () => {
    const { advance, field, rerender, type } = setup({ query: makeQuery() });
    type("perla");
    advance(SEARCH_DEBOUNCE_MS);
    rerender(makeQuery({ q: "perla" }));

    rerender(makeQuery());

    expect(field()).toHaveValue("");
  });

  test("a search from elsewhere drops the one still waiting to be sent", () => {
    const { advance, field, rerender, type } = setup({
      query: makeQuery({ q: "perla" }),
    });

    type("aro");
    advance(SEARCH_DEBOUNCE_MS - 1);
    rerender(makeQuery({ q: "collar" }));
    advance(SEARCH_DEBOUNCE_MS);

    expect(replace).not.toHaveBeenCalled();
    expect(field()).toHaveValue("collar");
  });

  test("shows a search the address brought from elsewhere", () => {
    const { field, rerender } = setup({ query: makeQuery({ q: "perla" }) });

    expect(field()).toHaveValue("perla");

    rerender(makeQuery({ q: "collar" }));
    expect(field()).toHaveValue("collar");

    rerender(makeQuery());
    expect(field()).toHaveValue("");
  });

  test("before the script runs, the form itself carries the rest of the selection", () => {
    const { field, form } = setup();

    expect(form()).toHaveAttribute("action", "/lr-market/products");
    expect(
      [...form().querySelectorAll('input[type="hidden"]')].map((input) => [
        input.getAttribute("name"),
        input.getAttribute("value"),
      ])
    ).toEqual([
      ["category", "collares"],
      ["color", "dorado,plateado"],
      ["sort", "price_asc"],
    ]);
    expect(field()).toHaveAttribute("name", "q");
    expect(field()).toHaveAttribute("maxlength", "100");
  });

  test("carries nothing extra for the whole catalog, newest first", () => {
    const { form } = setup({ locale: "en", query: makeQuery() });

    expect(form()).toHaveAttribute("action", "/en/lr-market/products");
    expect(form().querySelectorAll('input[type="hidden"]')).toHaveLength(0);
  });
});
