import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import type { ListAttribute } from "@/lib/admin/product-filters";
import { EMPTY_PRODUCTS_QUERY, type ProductsQuery } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";
import { makeStoreCategory } from "@/test/factories/store-category";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { createQueryWrapper } from "@/test/setup-helpers";

import { ProductFilterPanel } from "./product-filter-panel";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

/** The store's categories: a group of two, and one in no group. */
const CATEGORIES = [
  makeStoreCategory({
    id: 1,
    nameEn: "Jewellery",
    nameEs: "Bijouterie",
    productCount: 1,
    slug: "bijouterie",
  }),
  makeStoreCategory({
    id: 2,
    nameEn: "Rings",
    nameEs: "Anillos",
    parentId: 1,
    position: 1,
    productCount: 12,
    slug: "anillos",
  }),
  makeStoreCategory({
    id: 3,
    nameEn: "Earrings",
    nameEs: "Aros",
    parentId: 1,
    position: 2,
    productCount: 11,
    slug: "aros",
  }),
  makeStoreCategory({
    id: 4,
    nameEn: "Bubbles",
    nameEs: "Burbujeros",
    position: 3,
    productCount: 7,
    slug: "burbujeros",
  }),
];

function makeValue(
  id: number,
  slug: string,
  names: { nameEn: string | null; nameEs: string },
  swatchColor: string | null = null
): ListAttribute["values"][number] {
  return { ...names, id, position: id, productCount: 0, slug, swatchColor };
}

/** The store's filters: a color with swatches, and one without values. */
const ATTRIBUTES: ListAttribute[] = [
  {
    id: 7,
    nameEn: "Color",
    nameEs: "Color",
    position: 0,
    slug: "color",
    values: [
      makeValue(1, "dorado", { nameEn: "Gold", nameEs: "Dorado" }, "#d4af37"),
      makeValue(2, "violeta", { nameEn: "Purple", nameEs: "Violeta" }),
    ],
  },
  {
    id: 8,
    nameEn: null,
    nameEs: "Talle",
    position: 1,
    slug: "talle",
    values: [],
  },
];

function makeQuery(overrides: Partial<ProductsQuery> = {}): ProductsQuery {
  return { ...EMPTY_PRODUCTS_QUERY, ...overrides };
}

/** A count that never comes. */
const HANG = () => undefined;

const COUNT_REFUSAL = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

/** What `product.list` answers for the count: `total` matches. */
function makeCount(total: number, totalCapped = false) {
  return {
    currencyCode: "UYU",
    items: [],
    limit: 1,
    page: 1,
    pageCount: total,
    total,
    totalCapped,
  };
}

/**
 * The panel over `product.list`, which counts `total` matches; `query` is
 * the address's selection.
 */
function setup({
  activeCount = 0,
  attributes = ATTRIBUTES,
  attributesFailed = false,
  categories = CATEGORIES,
  categoriesFailed = false,
  listsRead = true,
  locale = "en",
  query = makeQuery(),
  total = 7,
  totalCapped = false,
}: {
  activeCount?: number;
  attributes?: ListAttribute[];
  /** Whether the store's filters' read failed (they are then unread). */
  attributesFailed?: boolean;
  categories?: typeof CATEGORIES;
  /** Whether the categories' read failed (they are then unread). */
  categoriesFailed?: boolean;
  /** Whether the store's categories and filters have been read. */
  listsRead?: boolean;
  locale?: Locale;
  query?: ProductsQuery;
  total?: number;
  totalCapped?: boolean;
} = {}) {
  const list = vi.fn(() => makeCount(total, totalCapped));
  const retry = vi.fn<() => void>();
  const retryAttributes = vi.fn<() => void>();
  server.use(createOrpcHandler("product.list", list));
  const panel = (shown: ProductsQuery) => (
    <ProductFilterPanel
      activeCount={activeCount}
      attributes={listsRead && !attributesFailed ? attributes : undefined}
      attributesFailed={attributesFailed}
      categories={listsRead && !categoriesFailed ? categories : undefined}
      categoriesFailed={categoriesFailed}
      className="custom"
      onRetryAttributes={retryAttributes}
      onRetryCategories={retry}
      query={shown}
    />
  );
  const view = renderWithI18n(panel(query), {
    locale,
    wrapper: createQueryWrapper(),
  });
  const user = userEvent.setup();
  const button = () => screen.getByTestId("product-filters-button");
  const sheet = () => screen.getByTestId("product-filters-sheet");

  return {
    button,
    list,
    /** What the foot says of the count, whole. */
    matches: () => screen.getByTestId("filter-matches").textContent,
    open: async () => {
      await user.click(button());
      return sheet();
    },
    /** The address changing under the panel (back, forward). */
    rerender: (shown: ProductsQuery) => {
      view.rerender(panel(shown));
    },
    retry,
    retryAttributes,
    sheet,
    user,
  };
}

describe("ProductFilterPanel", () => {
  test.each([
    [0, "Filters", null],
    [1, "Filters, 1 active", "1"],
    [3, "Filters, 3 active", "3"],
  ] as const)(
    "with %i active values, is named %j and shows the count %j",
    (activeCount, name, badge) => {
      const { button } = setup({ activeCount });

      expect(button()).toHaveAccessibleName(name);
      expect(button()).toHaveClass("custom");
      expect(
        screen.queryByTestId("product-filters-count")?.textContent ?? null
      ).toBe(badge);
    }
  );

  test("opens a sheet with the address's selection already chosen", async () => {
    const { open } = setup({
      query: makeQuery({
        availability: "unavailable",
        categories: ["anillos"],
        filters: [{ attribute: "color", values: ["dorado"] }],
        status: "draft",
      }),
    });

    const sheet = await open();

    expect(
      within(sheet).getByRole("heading", { name: "Filters" })
    ).toBeVisible();
    expect(sheet).toHaveAccessibleDescription(
      "Choose which articles to see. The list changes when you tap Apply."
    );
    const status = within(sheet).getByRole("group", { name: "Status" });
    expect(
      within(status)
        .getAllByRole("radio")
        .map((radio) => [
          radio.closest("label")?.textContent,
          radio.matches(":checked"),
        ])
    ).toEqual([
      ["All", false],
      ["Draft", true],
      ["Published", false],
    ]);
    const availability = within(sheet).getByRole("group", {
      name: "Availability",
    });
    expect(
      within(availability).getByRole("radio", { name: "Not available" })
    ).toBeChecked();
    expect(
      within(sheet).getByRole("checkbox", { name: /Rings/u })
    ).toBeChecked();
    expect(
      within(sheet).getByRole("checkbox", { name: /Earrings/u })
    ).not.toBeChecked();
    expect(within(sheet).getByRole("checkbox", { name: "Gold" })).toBeChecked();
    expect(
      within(sheet).getByRole("checkbox", { name: "Purple" })
    ).not.toBeChecked();
  });

  test("lists a group above its categories, counting their articles, then the categories in no group", async () => {
    const { open } = setup();

    const sheet = await open();

    const rows = within(
      within(sheet).getByRole("group", { name: "Category" })
    ).getAllByRole("checkbox");
    expect(rows.map((row) => row.closest("label")?.textContent)).toEqual([
      "Jewellery24",
      "Rings12",
      "Earrings11",
      "Bubbles7",
    ]);
    expect(screen.getByTestId("filter-category-anillos")).toHaveClass("ml-6");
    expect(screen.getByTestId("filter-category-bijouterie")).not.toHaveClass(
      "ml-6"
    );
  });

  test("shows each filter's values as pills, a color with its swatch, and no filter without values", async () => {
    const { open } = setup();

    const sheet = await open();

    const color = within(sheet).getByRole("group", { name: "Color" });
    const gold = within(color).getByRole("checkbox", { name: "Gold" });
    expect(gold.closest("label")?.querySelector("[aria-hidden]")).toHaveStyle({
      backgroundColor: "#d4af37",
    });
    expect(
      within(color)
        .getByRole("checkbox", { name: "Purple" })
        .closest("label")
        ?.querySelector("[aria-hidden]")
    ).toBeNull();
    expect(within(sheet).queryByRole("group", { name: "Talle" })).toBeNull();
  });

  test("says the categories failed to load, with a retry, never that there are none", async () => {
    const { open, retry, user } = setup({ categoriesFailed: true });

    const sheet = await open();
    const category = within(sheet).getByRole("group", { name: "Category" });

    expect(within(category).getByRole("alert")).toHaveTextContent(
      "We couldn't load the categories."
    );
    expect(
      within(category).queryByText("There are no categories yet.")
    ).toBeNull();
    await user.click(
      within(category).getByRole("button", { name: "Try again" })
    );
    expect(retry).toHaveBeenCalledExactlyOnceWith();
  });

  test("says the store's filters failed to load, with a retry of their own, and keeps the categories", async () => {
    const { open, retry, retryAttributes, user } = setup({
      attributesFailed: true,
    });

    const sheet = await open();
    const failed = within(sheet).getByTestId("filter-attributes-failed");

    expect(failed).toHaveAttribute("role", "alert");
    expect(failed).toHaveTextContent("We couldn't load the store's filters.");
    expect(within(sheet).queryByRole("group", { name: "Color" })).toBeNull();
    expect(
      within(within(sheet).getByRole("group", { name: "Category" })).getByRole(
        "checkbox",
        { name: /^Rings/u }
      )
    ).toBeInTheDocument();
    const again = within(failed).getByRole("button", { name: "Try again" });
    expect(again).toHaveAccessibleDescription(
      "We couldn't load the store's filters."
    );
    await user.click(again);
    expect(retryAttributes).toHaveBeenCalledExactlyOnceWith();
    expect(retry).not.toHaveBeenCalled();
  });

  test("with both reads failed, each retry reads its own list again, in Spanish", async () => {
    const { open, retry, retryAttributes, user } = setup({
      attributesFailed: true,
      categoriesFailed: true,
      locale: "es",
    });

    const sheet = await open();

    expect(
      within(sheet)
        .getAllByRole("alert")
        .map((alert) => alert.textContent)
    ).toEqual([
      "No pudimos cargar las categorías.Reintentar",
      "No pudimos cargar los filtros de la tienda.Reintentar",
    ]);
    await user.click(
      within(within(sheet).getByTestId("filter-categories-failed")).getByRole(
        "button",
        { name: "Reintentar" }
      )
    );
    expect(retry).toHaveBeenCalledExactlyOnceWith();
    expect(retryAttributes).not.toHaveBeenCalled();
    await user.click(
      within(within(sheet).getByTestId("filter-attributes-failed")).getByRole(
        "button",
        { name: "Reintentar" }
      )
    );
    expect(retryAttributes).toHaveBeenCalledExactlyOnceWith();
  });

  test("holds the categories' place while they load, never saying there are none", async () => {
    const { open } = setup({ listsRead: false });

    const sheet = await open();
    const category = within(sheet).getByRole("group", { name: "Category" });

    expect(
      within(category).getByTestId("filter-categories-pending")
    ).toHaveAttribute("aria-busy", "true");
    expect(
      within(category).queryByText("There are no categories yet.")
    ).toBeNull();
    expect(within(category).queryByRole("alert")).toBeNull();
  });

  test("says when the store has no categories yet", async () => {
    const { open } = setup({ categories: [] });

    const sheet = await open();

    expect(
      within(within(sheet).getByRole("group", { name: "Category" })).getByText(
        "There are no categories yet."
      )
    ).toBeVisible();
  });

  test("counts what the choice would show, one row read in the default order, the categories in the store's order", async () => {
    const { list, open, user } = setup({
      // The list's own order: a count needs none.
      query: makeQuery({
        categories: ["aros"],
        dir: "desc",
        page: 4,
        q: "aro",
        sort: "price",
      }),
    });
    const sheet = await open();
    await waitFor(() => {
      expect(list).toHaveBeenCalledExactlyOnceWith({
        categories: ["aros"],
        limit: 1,
        locale: "en",
        q: "aro",
      });
    });

    await user.click(within(sheet).getByRole("checkbox", { name: /Rings/u }));
    await user.click(within(sheet).getByRole("checkbox", { name: "Purple" }));

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        categories: ["anillos", "aros"],
        filters: [{ attribute: "color", values: ["violeta"] }],
        limit: 1,
        locale: "en",
        q: "aro",
      });
    });
    expect(push).not.toHaveBeenCalled();
  });

  test.each([
    [0, false, "No article matches"],
    [1, false, "1 article matches"],
    [7, false, "7 articles match"],
    [10_000, true, "Over 10,000 articles match"],
  ])("says %i matches (capped: %s) as %j", async (total, totalCapped, said) => {
    const { matches, open } = setup({ total, totalCapped });

    await open();

    // The output is there, empty, before the count arrives: wait for its
    // words, all of them ("17 articles match" is not "7").
    await waitFor(() => {
      expect(matches()).toBe(said);
    });
  });

  test("shows no count while the new choice's comes, and says when it cannot count, Apply still there", async () => {
    const { matches, open, user } = setup({ total: 7 });
    const sheet = await open();
    await waitFor(() => {
      expect(matches()).toBe("7 articles match");
    });

    // The next choice's count is on its way: the last one is not it.
    server.use(
      createOrpcHandler(
        "product.list",
        async () => await new Promise<ReturnType<typeof makeCount>>(HANG)
      )
    );
    await user.click(within(sheet).getByRole("radio", { name: "Published" }));
    await waitFor(() => {
      expect(screen.getByTestId("filter-matches")).toHaveAttribute(
        "aria-busy",
        "true"
      );
    });
    expect(matches()).toBe("");

    server.use(createOrpcErrorHandler("product.list", COUNT_REFUSAL));
    await user.click(within(sheet).getByRole("radio", { name: "Draft" }));

    await waitFor(() => {
      expect(matches()).toBe(
        "We couldn't count the articles. You can still apply the filters."
      );
    });
    expect(within(sheet).getByRole("button", { name: "Apply" })).toBeEnabled();
  });

  test("Clear empties the choice without changing the list", async () => {
    const { list, open, user } = setup({
      query: makeQuery({
        availability: "available",
        categories: ["anillos"],
        filters: [{ attribute: "color", values: ["dorado"] }],
        status: "published",
      }),
    });
    const sheet = await open();

    await user.click(within(sheet).getByRole("button", { name: "Clear" }));

    expect(
      within(sheet)
        .getAllByRole("radio", { checked: true })
        .map((radio) => radio.closest("label")?.textContent)
    ).toEqual(["All", "All"]);
    expect(within(sheet).queryAllByRole("checkbox", { checked: true })).toEqual(
      []
    );
    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({ limit: 1, locale: "en" });
    });
    expect(push).not.toHaveBeenCalled();
    expect(sheet).toBeVisible();
  });

  test("Apply puts the choice in the address from the first page, keeping the search and the order, and closes", async () => {
    const { button, open, user } = setup({
      query: makeQuery({
        categories: ["burbujeros"],
        dir: "asc",
        page: 3,
        q: "aro",
        sort: "price",
      }),
    });
    const sheet = await open();

    await user.click(within(sheet).getByRole("radio", { name: "Published" }));
    await user.click(
      within(sheet).getByRole("radio", { name: "Not available" })
    );
    await user.click(within(sheet).getByRole("checkbox", { name: /Bubbles/u }));
    await user.click(
      within(sheet).getByRole("checkbox", { name: /Earrings/u })
    );
    await user.click(within(sheet).getByRole("checkbox", { name: /Rings/u }));
    await user.click(within(sheet).getByRole("checkbox", { name: "Purple" }));
    await user.click(within(sheet).getByRole("checkbox", { name: "Gold" }));
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));

    expect(push).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?q=aro&status=published&availability=unavailable&category=anillos,aros&f.color=dorado,violeta&sort=price",
      { scroll: false }
    );
    await waitFor(() => {
      expect(screen.queryByTestId("product-filters-sheet")).toBeNull();
    });
    expect(button()).toHaveFocus();
  });

  test("before the store's categories and filters are read, Apply and the count keep the address's own", async () => {
    const { list, open, user } = setup({
      listsRead: false,
      query: makeQuery({
        categories: ["anillos"],
        filters: [{ attribute: "color", values: ["dorado"] }],
        q: "aro",
      }),
    });
    const sheet = await open();
    await user.click(within(sheet).getByRole("radio", { name: "Published" }));

    await waitFor(() => {
      expect(list).toHaveBeenLastCalledWith({
        categories: ["anillos"],
        filters: [{ attribute: "color", values: ["dorado"] }],
        limit: 1,
        locale: "en",
        q: "aro",
        status: "published",
      });
    });
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));

    expect(push).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?q=aro&status=published&category=anillos&f.color=dorado",
      { scroll: false }
    );
  });

  test("refuses a category past the twenty the address keeps, and says why, until one is removed", async () => {
    const many = Array.from({ length: 21 }, (_, index) =>
      makeStoreCategory({
        id: 100 + index,
        nameEn: `Category ${index + 1}`,
        nameEs: `Categoría ${index + 1}`,
        position: index,
        slug: `category-${index + 1}`,
      })
    );
    const { open, user } = setup({
      categories: many,
      query: makeQuery({
        categories: many.slice(0, 19).map((category) => category.slug),
      }),
    });
    const sheet = await open();
    const box = (position: number) =>
      within(
        within(sheet).getByTestId(`filter-category-category-${position}`)
      ).getByRole("checkbox");
    expect(within(sheet).queryByTestId("filter-limit")).toBeNull();

    // The twentieth is still taken; then the twenty-first is refused.
    await user.click(box(20));
    expect(box(20)).toBeChecked();
    expect(box(21)).toBeDisabled();
    expect(box(1)).toBeEnabled();
    expect(within(sheet).getByTestId("filter-limit")).toHaveTextContent(
      "Up to 20 categories at once: remove one to choose another."
    );

    await user.click(box(1));
    expect(box(21)).toBeEnabled();
    expect(within(sheet).queryByTestId("filter-limit")).toBeNull();
  });

  test("counts against the twenty only the categories the store still has", async () => {
    const { open } = setup({
      // An old bookmark: twenty categories the store no longer has.
      query: makeQuery({
        categories: Array.from(
          { length: 20 },
          (_, index) => `gone-${index + 1}`
        ),
      }),
    });

    const sheet = await open();

    expect(
      within(sheet)
        .getAllByRole("checkbox")
        .filter((box) => box.closest("[data-testid^='filter-category-']"))
        .map((box) => box.matches(":disabled"))
    ).toEqual([false, false, false, false]);
    expect(within(sheet).queryByTestId("filter-limit")).toBeNull();
  });

  test("refuses a value past the twenty a filter keeps, and a filter past the ten the address keeps", async () => {
    const values = Array.from({ length: 21 }, (_, index) =>
      makeValue(index + 1, `value-${index + 1}`, {
        nameEn: `Value ${index + 1}`,
        nameEs: `Valor ${index + 1}`,
      })
    );
    const filters: ListAttribute[] = Array.from({ length: 11 }, (_, index) => ({
      id: 200 + index,
      nameEn: `Filter ${index + 1}`,
      nameEs: `Filtro ${index + 1}`,
      position: index,
      slug: `filter-${index + 1}`,
      values:
        index === 0
          ? values
          : [
              makeValue(300 + index, "only", {
                nameEn: `Only ${index + 1}`,
                nameEs: `Único ${index + 1}`,
              }),
            ],
    }));
    // One below each limit: nineteen values of the first filter, nine
    // filters in use.
    const { open, user } = setup({
      attributes: filters,
      query: makeQuery({
        filters: [
          {
            attribute: "filter-1",
            values: values.slice(0, 19).map((value) => value.slug),
          },
          ...filters.slice(1, 9).map((filter) => ({
            attribute: filter.slug,
            values: ["only"],
          })),
        ],
      }),
    });
    const sheet = await open();
    const group = (name: string) => within(sheet).getByRole("group", { name });
    const box = (filter: string, name: string) =>
      within(group(filter)).getByRole("checkbox", { name });
    expect(within(sheet).queryByTestId("filter-limit")).toBeNull();

    // The twentieth value is still taken; then the twenty-first is refused.
    await user.click(box("Filter 1", "Value 20"));
    expect(box("Filter 1", "Value 20")).toBeChecked();
    expect(box("Filter 1", "Value 21")).toBeDisabled();
    expect(
      within(group("Filter 1")).getByTestId("filter-limit")
    ).toHaveTextContent(
      "Up to 20 values per filter: remove one to choose another."
    );
    // The tenth filter is still taken; then an eleventh takes nothing.
    expect(box("Filter 11", "Only 11")).toBeEnabled();
    await user.click(box("Filter 10", "Only 10"));
    expect(box("Filter 10", "Only 10")).toBeChecked();
    expect(box("Filter 11", "Only 11")).toBeDisabled();
    expect(
      within(group("Filter 11")).getByTestId("filter-limit")
    ).toHaveTextContent(
      "Up to 10 filters at once: clear another to use this one."
    );
    expect(within(group("Filter 10")).queryByTestId("filter-limit")).toBeNull();
  });

  test("an address changed under the open sheet (back, forward) starts the choice again from it", async () => {
    const { open, rerender, user } = setup({
      query: makeQuery({ status: "draft" }),
    });
    const sheet = await open();
    await user.click(within(sheet).getByRole("checkbox", { name: "Gold" }));

    rerender(makeQuery({ status: "published" }));

    await waitFor(() => {
      expect(
        within(sheet).getByRole("radio", { name: "Published" })
      ).toBeChecked();
    });
    expect(
      within(sheet).getByRole("checkbox", { name: "Gold" })
    ).not.toBeChecked();
    await user.click(within(sheet).getByRole("button", { name: "Apply" }));
    expect(push).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?status=published",
      { scroll: false }
    );
  });

  test("Escape drops the choice: the sheet opens again on the address's selection", async () => {
    const { button, open, user } = setup({
      query: makeQuery({ status: "draft" }),
    });
    const sheet = await open();
    await user.click(within(sheet).getByRole("radio", { name: "Published" }));
    await user.click(within(sheet).getByRole("checkbox", { name: "Gold" }));

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByTestId("product-filters-sheet")).toBeNull();
    });
    expect(button()).toHaveFocus();
    const again = await open();

    expect(within(again).getByRole("radio", { name: "Draft" })).toBeChecked();
    expect(
      within(again).getByRole("checkbox", { name: "Gold" })
    ).not.toBeChecked();
    expect(push).not.toHaveBeenCalled();
  });

  test("speaks Spanish", async () => {
    const { button, open } = setup({ activeCount: 2, locale: "es", total: 1 });

    expect(button()).toHaveAccessibleName("Filtros, 2 activos");
    const sheet = await open();

    expect(within(sheet).getByRole("group", { name: "Estado" })).toBeVisible();
    expect(
      within(sheet).getByRole("checkbox", { name: /Bijouterie/u })
    ).toBeVisible();
    expect(
      within(sheet).getByRole("button", { name: "Aplicar" })
    ).toBeVisible();
    expect(
      within(sheet).getByRole("button", { name: "Cerrar filtros" })
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.getByTestId("filter-matches").textContent).toBe(
        "Coincide 1 artículo"
      );
    });
  });
});
