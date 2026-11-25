import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { EMPTY_PRODUCTS_QUERY, type ProductsQuery } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";

import { useProductsAddress } from "./use-products-address";

// One spy for both, so the order of the navigations is its calls' order.
const { navigated } = vi.hoisted(() => ({
  navigated: vi.fn<(method: string, path: string, options: unknown) => void>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (path: string, options: unknown) => {
      navigated("push", path, options);
    },
    replace: (path: string, options: unknown) => {
      navigated("replace", path, options);
    },
  }),
}));

function makeQuery(overrides: Partial<ProductsQuery> = {}): ProductsQuery {
  return { ...EMPTY_PRODUCTS_QUERY, ...overrides };
}

const SEARCH = (q: string) => (base: ProductsQuery) => ({
  ...base,
  page: 1,
  q,
});
const DRAFTS = (base: ProductsQuery) => ({
  ...base,
  page: 1,
  status: "draft" as const,
});

/** The list's address over `query`; `show` is the page handing another. */
function setup(query = makeQuery(), locale: Locale = "en") {
  const view = renderHook(
    ({ shown }: { shown: ProductsQuery }) => useProductsAddress(shown, locale),
    { initialProps: { shown: query } }
  );

  return {
    address: () => view.result.current,
    /** Every navigation asked for, in order, as method and address. */
    asked: () => navigated.mock.calls,
    show: (shown: ProductsQuery) => {
      view.rerender({ shown });
    },
  };
}

describe("useProductsAddress", () => {
  test("asks for a change on the address it renders, keeping the rest of the selection", () => {
    const { address, asked } = setup(makeQuery({ page: 3, sort: "price" }));

    act(() => {
      address().replace(SEARCH("aro"));
    });

    expect(asked()).toEqual([
      [
        "replace",
        "/en/admin/products?q=aro&sort=price&dir=desc",
        { scroll: false },
      ],
    ]);
  });

  test("the search's wait ending after Apply was asked, before Apply showed, keeps the filters", () => {
    const { address, asked, show } = setup();

    act(() => {
      address().push(DRAFTS);
      address().replace(SEARCH("aro"));
    });
    show(makeQuery({ status: "draft" }));
    show(makeQuery({ q: "aro", status: "draft" }));

    expect(asked()).toEqual([
      ["push", "/en/admin/products?status=draft", { scroll: false }],
      ["replace", "/en/admin/products?q=aro&status=draft", { scroll: false }],
    ]);
  });

  test("Apply asked while the search's replace is on its way keeps the search", () => {
    const { address, asked, show } = setup();

    act(() => {
      address().replace(SEARCH("aro"));
      address().push(DRAFTS);
    });
    // Either may commit first; the last asked holds both.
    show(makeQuery({ q: "aro" }));
    show(makeQuery({ q: "aro", status: "draft" }));

    expect(asked()).toEqual([
      ["replace", "/en/admin/products?q=aro", { scroll: false }],
      ["push", "/en/admin/products?q=aro&status=draft", { scroll: false }],
    ]);
  });

  test("its own address arriving while a newer one is on its way keeps building on the newer", () => {
    const { address, asked, show } = setup();

    act(() => {
      address().replace(SEARCH("aro"));
      address().push(DRAFTS);
    });
    show(makeQuery({ q: "aro" }));
    act(() => {
      address().replace(SEARCH("anillo"));
    });

    expect(asked().at(-1)).toEqual([
      "replace",
      "/en/admin/products?q=anillo&status=draft",
      { scroll: false },
    ]);
  });

  test("an address it did not ask for (back, a link) is the selection from then on", () => {
    const { address, asked, show } = setup();

    act(() => {
      address().replace(SEARCH("aro"));
    });
    show(makeQuery({ dir: "asc", sort: "title" }));
    act(() => {
      address().push(DRAFTS);
    });

    expect(asked().at(-1)).toEqual([
      "push",
      "/en/admin/products?status=draft&sort=title",
      { scroll: false },
    ]);
  });

  test("asks for nothing when the change leaves the newest selection as it is", () => {
    const { address, asked } = setup(makeQuery({ status: "draft" }));

    act(() => {
      address().push(DRAFTS);
      address().replace(SEARCH("aro"));
      address().replace(SEARCH("aro"));
    });

    expect(asked()).toEqual([
      ["replace", "/en/admin/products?q=aro&status=draft", { scroll: false }],
    ]);
  });

  test("a change back to the address shown forgets the ones before it: a later back to one of them is an address from elsewhere", () => {
    const { address, asked, show } = setup();

    act(() => {
      address().replace(SEARCH("a"));
      // Cleared at once: back to the address shown, `?q=a` never arrives.
      address().replace((base) => ({ ...base, q: null }));
    });
    // Back (or forward) lands on `?q=a` later.
    show(makeQuery({ q: "a" }));
    act(() => {
      address().push(DRAFTS);
    });

    expect(asked().at(-1)).toEqual([
      "push",
      "/en/admin/products?q=a&status=draft",
      { scroll: false },
    ]);
  });

  test("a search holding U+0000 asks for its address without it, and knows it as its own when it arrives", () => {
    const { address, asked, show } = setup();

    act(() => {
      address().replace(SEARCH("aro\u0000"));
      address().push(DRAFTS);
    });
    show(makeQuery({ q: "aro" }));
    act(() => {
      address().replace(SEARCH("anillo"));
    });

    expect(asked()).toEqual([
      ["replace", "/en/admin/products?q=aro", { scroll: false }],
      ["push", "/en/admin/products?q=aro&status=draft", { scroll: false }],
      [
        "replace",
        "/en/admin/products?q=anillo&status=draft",
        { scroll: false },
      ],
    ]);
  });

  test("builds the address in the page's language", () => {
    const { address, asked } = setup(makeQuery(), "es");

    act(() => {
      address().push(DRAFTS);
    });

    expect(asked()).toEqual([
      ["push", "/admin/products?status=draft", { scroll: false }],
    ]);
  });
});
