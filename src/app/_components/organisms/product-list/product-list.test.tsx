import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ListAttribute } from "@/lib/admin/product-filters";
import { EMPTY_PRODUCTS_QUERY, type ProductsQuery } from "@/lib/admin/products";
import type { ProductsPage } from "@/lib/hooks/product";
import type { Locale } from "@/lib/i18n/config";
import { makeStoreCategory } from "@/test/factories/store-category";
import { renderWithI18n } from "@/test/i18n";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { required } from "@/test/required";
import { createQueryWrapper } from "@/test/setup-helpers";

import { ProductList } from "./product-list";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

// The shared client mock (`@/test/mocks/orpc-client`) reads the JSON alone,
// so a date stays a string; the rows need the dates the real client revives
// (oRPC's `meta`). This one revives the list's, over the same MSW handlers.
vi.mock("@/lib/orpc/client", () => {
  /** A page of `product.list` with its articles' dates read back as dates. */
  const withDates = (json: unknown) => {
    if (
      typeof json === "object" &&
      json !== null &&
      "items" in json &&
      Array.isArray(json.items)
    ) {
      // `Array.isArray` leaves `any[]`; as `unknown[]` each row is narrowed.
      const items: unknown[] = json.items;

      for (const item of items) {
        if (
          typeof item === "object" &&
          item !== null &&
          "updatedAt" in item &&
          typeof item.updatedAt === "string"
        ) {
          item.updatedAt = new Date(item.updatedAt);
        }
      }
    }

    return json;
  };
  const call = async (path: string, input: unknown): Promise<unknown> => {
    const response = await globalThis.fetch(
      `http://localhost:3000/api/orpc/${path}`,
      {
        body: JSON.stringify({ json: input, meta: [] }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
    const body: { json?: unknown; message?: string } = await response.json();

    if (!response.ok) {
      throw new Error(body.message);
    }

    return path === "product/list" ? withDates(body.json) : body.json;
  };
  const procedure = (path: string) => {
    const segments = path.split("/");

    return {
      key: () => [...segments, {}],
      queryKey: ({ input }: { input?: unknown } = {}) => [
        ...segments,
        { input },
      ],
      queryOptions: ({ input, ...options }: { input?: unknown } = {}) => ({
        queryFn: async () => await call(path, input),
        queryKey: [...segments, { input }],
        ...options,
      }),
    };
  };

  return {
    orpc: {
      attribute: { list: procedure("attribute/list") },
      category: { list: procedure("category/list") },
      product: { list: procedure("product/list") },
    },
  };
});

const RENDERED_AT = Date.parse("2026-11-18T12:00:00.000Z");
const HOUR = 3_600_000;
/** A read that never answers. */
const HANG = () => undefined;
/** What the list says of a store with no article at all. */
const EMPTY_STORE =
  "No articles yet. Start with the photos: it is published in a minute.";

/** A row of `product.list` as it travels: its date as oRPC sends it. */
type ListedItem = Omit<ProductsPage["items"][number], "updatedAt"> & {
  updatedAt: string;
};

function makeItem(id: number, overrides: Partial<ListedItem> = {}): ListedItem {
  return {
    category: { id: 2, nameEn: "Rings", nameEs: "Anillos" },
    cover: null,
    id,
    isAvailable: true,
    priceAmount: 129_000,
    slug: `articulo-${id}`,
    status: "published",
    title: `Artículo ${id}`,
    titleLang: "es",
    updatedAt: new Date(RENDERED_AT - 2 * HOUR).toISOString(),
    ...overrides,
  };
}

function makePage(
  items: ListedItem[],
  overrides: Partial<
    Pick<ProductsPage, "page" | "pageCount" | "total" | "totalCapped">
  > = {}
) {
  return {
    currencyCode: "UYU",
    items,
    limit: 24,
    page: 1,
    pageCount: 1,
    total: items.length,
    totalCapped: false,
    ...overrides,
  };
}

function makeQuery(overrides: Partial<ProductsQuery> = {}): ProductsQuery {
  return { ...EMPTY_PRODUCTS_QUERY, ...overrides };
}

const CATEGORIES = [
  makeStoreCategory({
    id: 2,
    nameEn: "Rings",
    nameEs: "Anillos",
    slug: "anillos",
  }),
];

const ATTRIBUTES: ListAttribute[] = [
  {
    id: 7,
    nameEn: "Color",
    nameEs: "Color",
    position: 0,
    slug: "color",
    values: [
      {
        id: 1,
        nameEn: "Gold",
        nameEs: "Dorado",
        position: 0,
        productCount: 3,
        slug: "dorado",
        swatchColor: "#d4af37",
      },
    ],
  },
];

const REFUSAL = {
  code: "INTERNAL_SERVER_ERROR",
  message: "Internal server error",
  status: 500,
};

// A link followed in a test goes nowhere: the screen is given its next
// address by hand, as the page would hand it over.
// Only a link's click: a button's prevented would never open its sheet.
function stayOnPage(event: MouseEvent) {
  if (event.target instanceof Element && event.target.closest("a[href]")) {
    event.preventDefault();
  }
}

afterEach(() => {
  window.removeEventListener("click", stayOnPage, true);
});

/**
 * The list over `product.list` (answering `answer(input)`), the store's
 * categories and filters, at `query`; or refusing the list when `refuses`.
 */
function setup({
  answer = () => makePage([makeItem(9), makeItem(8)]),
  listsFail = false,
  locale = "en",
  query = makeQuery(),
  refuses = false,
}: {
  answer?: (
    input: unknown
  ) => ReturnType<typeof makePage> | Promise<ReturnType<typeof makePage>>;
  /** Whether the store's categories and filters fail to load. */
  listsFail?: boolean;
  locale?: Locale;
  query?: ProductsQuery;
  refuses?: boolean;
} = {}) {
  // The browser's clock, which the ages follow once the screen is up.
  vi.setSystemTime(RENDERED_AT);
  const list = vi.fn(answer);
  server.use(
    refuses
      ? createOrpcErrorHandler("product.list", REFUSAL)
      : createOrpcHandler("product.list", list),
    listsFail
      ? createOrpcErrorHandler("category.list", REFUSAL)
      : createOrpcHandler("category.list", () => CATEGORIES),
    listsFail
      ? createOrpcErrorHandler("attribute.list", REFUSAL)
      : createOrpcHandler("attribute.list", () => ATTRIBUTES)
  );
  window.addEventListener("click", stayOnPage, true);
  const view = renderWithI18n(
    <ProductList query={query} renderedAt={RENDERED_AT} />,
    { locale, wrapper: createQueryWrapper() }
  );

  return {
    /** From now on the server answers every read. */
    heal: () => {
      server.use(createOrpcHandler("product.list", list));
    },
    /** From now on the store's categories and filters are read. */
    healLists: () => {
      server.use(
        createOrpcHandler("category.list", () => CATEGORIES),
        createOrpcHandler("attribute.list", () => ATTRIBUTES)
      );
    },
    list,
    /** The router's `push`, which the filter panel's "Aplicar" calls. */
    push,
    /** The page handing the screen another address. */
    navigate: (next: ProductsQuery) => {
      view.rerender(<ProductList query={next} renderedAt={RENDERED_AT} />);
    },
    rows: async () =>
      within(await screen.findByTestId("product-list-rows"))
        .getAllByTestId("product-row-title")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    user: userEvent.setup(),
  };
}

describe("ProductList", () => {
  test("holds the list's place with a skeleton until the page arrives", async () => {
    const { rows } = setup();

    expect(screen.getByTestId("product-list-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(await rows()).toEqual([
      ["Artículo 9", "/en/admin/products/9"],
      ["Artículo 8", "/en/admin/products/8"],
    ]);
    expect(screen.queryByTestId("product-list-skeleton")).toBeNull();
  });

  test("reads the page the address names, each article a link to its wizard with its age", async () => {
    const { list, rows } = setup({
      answer: () =>
        makePage([makeItem(30)], { page: 2, pageCount: 2, total: 25 }),
      query: makeQuery({ dir: "asc", page: 2, q: "aro", sort: "title" }),
    });

    expect(await rows()).toEqual([["Artículo 30", "/en/admin/products/30"]]);
    expect(list).toHaveBeenCalledExactlyOnceWith({
      locale: "en",
      page: 2,
      q: "aro",
      sort: "title",
    });
    expect(screen.getByTestId("product-row-updated")).toHaveTextContent(
      "2 hours ago"
    );
    expect(screen.getByTestId("product-list-table")).toHaveAccessibleName(
      "Store articles"
    );
  });

  test("its table says its roles outright, which its block display would drop in WebKit", async () => {
    setup();

    const rows = await screen.findByTestId("product-list-rows");

    expect([
      screen.getByTestId("product-list-table").getAttribute("role"),
      screen.getByTestId("product-list-columns").getAttribute("role"),
      rows.getAttribute("role"),
    ]).toEqual(["table", "rowgroup", "rowgroup"]);
  });

  test("says it could not load the articles, and reads again on retry", async () => {
    const { heal, rows, user } = setup({ refuses: true });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the articles.");
    expect(screen.queryByTestId("product-list-count")).toBeNull();

    heal();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await rows()).toEqual([
      ["Artículo 9", "/en/admin/products/9"],
      ["Artículo 8", "/en/admin/products/8"],
    ]);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test.each([
    [49, false, "49 articles"],
    [1, false, "1 article"],
    [10_000, true, "Over 10,000 articles"],
  ])(
    "counts %i matches (capped: %s) as %j",
    async (total, totalCapped, said) => {
      setup({
        answer: () =>
          makePage([makeItem(9)], {
            pageCount: Math.ceil(total / 24),
            total,
            totalCapped,
          }),
      });

      // All of it: "149 articles" is not "49".
      expect(
        (await screen.findByTestId("product-list-count")).textContent
      ).toBe(said);
    }
  );

  test("an empty store says so, without a way to clear anything", async () => {
    setup({ answer: () => makePage([]) });

    expect(await screen.findByTestId("empty-state")).toHaveTextContent(
      "No articles yet. Start with the photos: it is published in a minute."
    );
    expect(screen.queryByTestId("product-list-no-matches")).toBeNull();
    expect(screen.queryByTestId("product-list-foot")).toBeNull();
  });

  test("a search and filters nothing matches say so, clearing both but keeping the order", async () => {
    setup({
      answer: () => makePage([]),
      query: makeQuery({
        dir: "desc",
        q: "zzz",
        sort: "price",
        status: "draft",
      }),
    });

    const empty = await screen.findByTestId("product-list-no-matches");

    expect(empty).toHaveTextContent(
      "No article matches the search or the filters."
    );
    expect(
      within(empty).getByRole("link", { name: "Clear search and filters" })
    ).toHaveAttribute("href", "/en/admin/products?sort=price&dir=desc");
  });

  test("a page past the last one says so and leads back to the first, keeping the selection", async () => {
    setup({
      answer: () => makePage([], { page: 9, pageCount: 3, total: 49 }),
      query: makeQuery({ page: 9, q: "aro" }),
    });

    const empty = await screen.findByTestId("product-list-empty-page");

    expect(empty).toHaveTextContent("There are no articles on this page.");
    expect(
      within(empty).getByRole("link", { name: "Go to the first page" })
    ).toHaveAttribute("href", "/en/admin/products?q=aro");
    expect(screen.getByTestId("product-list-range")).toBeEmptyDOMElement();
    expect(screen.getByTestId("pagination-previous")).toHaveAttribute(
      "href",
      "/en/admin/products?q=aro&page=3"
    );
  });

  test("its foot says which articles show and leads to every page, keeping the selection", async () => {
    setup({
      answer: () =>
        makePage([makeItem(30), makeItem(31)], {
          page: 2,
          pageCount: 3,
          total: 49,
        }),
      query: makeQuery({ page: 2, q: "aro" }),
    });

    expect(await screen.findByTestId("product-list-range")).toHaveTextContent(
      "25–26 of 49"
    );
    const pages = within(screen.getByRole("navigation", { name: "Pages" }));
    expect(
      pages
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Previous page", "/en/admin/products?q=aro"],
      ["1", "/en/admin/products?q=aro"],
      ["2", "/en/admin/products?q=aro&page=2"],
      ["3", "/en/admin/products?q=aro&page=3"],
      ["Next page", "/en/admin/products?q=aro&page=3"],
    ]);
    expect(
      screen.getByTestId("product-list-table")
    ).toHaveAccessibleDescription("25–26 of 49");
  });

  test("lists as chips only the filters the store has, and counts them on Filters", async () => {
    setup({
      query: makeQuery({
        categories: ["anillos", "relojes"],
        filters: [
          { attribute: "color", values: ["dorado", "fucsia"] },
          { attribute: "talle", values: ["m"] },
        ],
      }),
    });

    const chips = await screen.findByRole("list", { name: "Active filters" });

    expect(
      within(chips)
        .getAllByRole("link")
        .map((link) => [
          link.getAttribute("aria-label") ?? link.textContent,
          link.getAttribute("href"),
        ])
    ).toEqual([
      [
        "Remove filter: Category: Rings",
        "/en/admin/products?category=relojes&f.color=dorado,fucsia&f.talle=m",
      ],
      [
        "Remove filter: Color: Gold",
        "/en/admin/products?category=anillos,relojes&f.color=fucsia&f.talle=m",
      ],
      ["Clear all", "/en/admin/products"],
    ]);
    expect(screen.getByTestId("product-filters-button")).toHaveAccessibleName(
      "Filters, 2 active"
    );
  });

  test("with the store's categories and filters unread, applying the filters keeps the address's own", async () => {
    const { push, user } = setup({
      listsFail: true,
      query: makeQuery({
        categories: ["anillos"],
        filters: [{ attribute: "color", values: ["dorado"] }],
      }),
    });
    await screen.findByTestId("product-row-9");

    await user.click(screen.getByTestId("product-filters-button"));
    await user.click(
      within(screen.getByTestId("product-filters-sheet")).getByRole("button", {
        name: "Apply",
      })
    );

    expect(push).toHaveBeenCalledExactlyOnceWith(
      "/en/admin/products?category=anillos&f.color=dorado",
      { scroll: false }
    );
  });

  test("a page reached from its foot takes focus once it shows; another search does not", async () => {
    const { navigate, user } = setup({
      answer: (input) => {
        const asked = typeof input === "object" && input !== null ? input : {};

        // Page 2 of the search, and only it, is row 30.
        if ("page" in asked && "q" in asked) {
          return makePage([makeItem(30)], { page: 2, pageCount: 2, total: 25 });
        }

        return makePage([makeItem("q" in asked ? 12 : 9)], {
          pageCount: 2,
          total: 25,
        });
      },
    });
    await screen.findByTestId("product-row-9");

    navigate(makeQuery({ q: "aro" }));

    expect(await screen.findByTestId("product-row-12")).toBeVisible();
    expect(screen.getByTestId("product-list-table")).not.toHaveFocus();

    const second = screen.getByRole("link", { name: "Page 2" });
    expect(second).toHaveAttribute("href", "/en/admin/products?q=aro&page=2");
    await user.click(second);
    navigate(makeQuery({ page: 2, q: "aro" }));

    await waitFor(() => {
      expect(screen.getByTestId("product-list-table")).toHaveFocus();
    });
    expect(screen.getByTestId("product-row-30")).toBeVisible();
  });

  test.each([
    // On page 2 already: the list goes elsewhere (its answer still on its
    // way) and comes back to the link's own page, as back would bring it.
    ["the current page's own link", "Page 2", null, 2],
    ["another page opened in a new tab", "Page 1", "Control", 1],
    ["another page opened in a new window", "Page 1", "Shift", 1],
  ] as const)(
    "a click on %s moves nothing, nor arms its page, reached later another way, to steal focus",
    async (_case, name, held, destination) => {
      const { navigate, user } = setup({
        answer: (input) => {
          const asked =
            typeof input === "object" && input !== null ? input : {};

          if ("sort" in asked) {
            // Never answers: the list stays on page 2's rows meanwhile.
            return new Promise<ReturnType<typeof makePage>>(HANG);
          }

          return "page" in asked
            ? makePage([makeItem(30)], { page: 2, pageCount: 2, total: 25 })
            : makePage([makeItem(9)], { pageCount: 2, total: 25 });
        },
        query: makeQuery({ page: 2 }),
      });
      await screen.findByTestId("product-row-30");
      const link = screen.getByRole("link", { name });

      if (held) {
        await user.keyboard(`{${held}>}`);
      }

      await user.click(link);

      if (held) {
        await user.keyboard(`{/${held}}`);
      }

      navigate(makeQuery({ sort: "price" }));
      navigate(makeQuery({ page: destination }));

      expect(
        await screen.findByTestId(`product-row-${destination === 2 ? 30 : 9}`)
      ).toBeVisible();
      expect(screen.getByTestId("product-list-table")).not.toHaveFocus();
    }
  );

  test("a step to a page that comes back empty is spent: a later page change keeps focus where it is", async () => {
    // Page 2 is empty until it is filled again.
    let pageTwoFilled = false;
    const refill = () => {
      pageTwoFilled = true;
    };
    const { navigate, user } = setup({
      answer: (input) => {
        const asked = typeof input === "object" && input !== null ? input : {};

        if ("page" in asked) {
          // Emptied meanwhile: the store lost the articles of page 2.
          return pageTwoFilled
            ? makePage([makeItem(30)], { page: 2, pageCount: 2, total: 25 })
            : makePage([], { page: 2, pageCount: 1, total: 24 });
        }

        return makePage([makeItem("sort" in asked ? 12 : 9)], {
          pageCount: 2,
          total: 25,
        });
      },
    });
    await screen.findByTestId("product-row-9");

    const second = screen.getByRole("link", { name: "Page 2" });
    expect(second).toHaveAttribute("href", "/en/admin/products?page=2");
    await user.click(second);
    navigate(makeQuery({ page: 2 }));
    expect(await screen.findByTestId("product-list-empty-page")).toBeVisible();

    navigate(makeQuery({ sort: "price" }));

    expect(await screen.findByTestId("product-row-12")).toBeVisible();
    expect(screen.getByTestId("product-list-table")).not.toHaveFocus();

    // Back on page 2 another way, its rows there again: the step was spent.
    refill();
    navigate(makeQuery({ page: 2 }));

    expect(await screen.findByTestId("product-row-30")).toBeVisible();
    expect(screen.getByTestId("product-list-table")).not.toHaveFocus();
  });

  test("a step of the pages replaced by another selection before it showed takes no focus there", async () => {
    const { navigate, user } = setup({
      answer: (input) => {
        const asked = typeof input === "object" && input !== null ? input : {};

        if ("page" in asked) {
          return makePage([makeItem(30)], { page: 2, pageCount: 2, total: 25 });
        }

        return makePage([makeItem("sort" in asked ? 12 : 9)], {
          pageCount: 2,
          total: 25,
        });
      },
    });
    await screen.findByTestId("product-row-9");

    // Page 2 is followed, but the order changes before it arrives.
    await user.click(screen.getByRole("link", { name: "Page 2" }));
    navigate(makeQuery({ sort: "price" }));

    expect(await screen.findByTestId("product-row-12")).toBeVisible();
    expect(screen.getByTestId("product-list-table")).not.toHaveFocus();

    // Its page reached later another way: the replaced step is gone.
    navigate(makeQuery({ page: 2 }));

    expect(await screen.findByTestId("product-row-30")).toBeVisible();
    expect(screen.getByTestId("product-list-table")).not.toHaveFocus();
  });

  test("a step of the pages leaves focus where the person moved it while the page came", async () => {
    const { navigate, user } = setup({
      answer: (input) =>
        typeof input === "object" && input !== null && "page" in input
          ? makePage([makeItem(30)], { page: 2, pageCount: 2, total: 25 })
          : makePage([makeItem(9)], { pageCount: 2, total: 25 }),
    });
    await screen.findByTestId("product-row-9");

    await user.click(screen.getByRole("link", { name: "Page 2" }));
    // On to the search before page 2 shows.
    screen.getByRole("searchbox", { name: "Search articles" }).focus();
    navigate(makeQuery({ page: 2 }));

    expect(await screen.findByTestId("product-row-30")).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Search articles" })
    ).toHaveFocus();
  });

  test("while another selection loads, says nothing of it from the last one's answer", async () => {
    const { navigate } = setup({
      answer: () => makePage([], { pageCount: 0, total: 0 }),
      query: makeQuery({ q: "zz" }),
    });
    expect(await screen.findByTestId("product-list-no-matches")).toBeVisible();
    server.use(
      createOrpcHandler(
        "product.list",
        async () => await new Promise<ReturnType<typeof makePage>>(HANG)
      )
    );

    // The search cleared: its answer is on its way, the last one is shown.
    navigate(makeQuery());

    await waitFor(() => {
      expect(screen.queryByTestId("product-list-no-matches")).toBeNull();
    });
    // Nothing of the last answer to hold: the skeleton holds the place.
    expect(screen.getByTestId("product-list-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.queryByText(EMPTY_STORE)).toBeNull();
    expect(screen.queryByTestId("product-list-count")).toBeNull();
    expect(screen.queryByTestId("product-list-foot")).toBeNull();
  });

  test("while another selection loads, keeps the last one's rows, marked busy, without a skeleton", async () => {
    const { navigate } = setup();
    await screen.findByTestId("product-row-9");
    server.use(
      createOrpcHandler(
        "product.list",
        async () => await new Promise<ReturnType<typeof makePage>>(HANG)
      )
    );

    navigate(makeQuery({ q: "aro" }));

    await waitFor(() => {
      expect(screen.getByTestId("product-list-table")).toHaveAttribute(
        "aria-busy",
        "true"
      );
    });
    expect(screen.getByTestId("product-row-9")).toBeVisible();
    expect(screen.queryByTestId("product-list-skeleton")).toBeNull();
  });

  test.each([
    [
      "no article matches",
      () => makePage([], { pageCount: 0, total: 0 }),
      null,
    ],
    [
      "the page is past the last",
      () => makePage([], { page: 9, pageCount: 2, total: 25 }),
      null,
    ],
    ["the table shows", () => makePage([makeItem(9)]), "xl:hidden"],
  ])(
    "when %s, the toolbar's sort hides from xl up only beside the table's headers",
    async (_case, answer, hidden) => {
      setup({ answer, query: makeQuery({ page: 9, q: "aro" }) });
      await screen.findByTestId("product-list-count");

      const menu = required(
        screen
          .getByTestId("product-list-toolbar")
          .querySelector("[data-slot='product-sort-menu']")
      );

      expect(menu.classList.contains("xl:hidden")).toBe(hidden !== null);
    }
  );

  test("says the categories failed in the filters, and reads them again on retry", async () => {
    const { healLists, user } = setup({ listsFail: true });
    await screen.findByTestId("product-row-9");

    await user.click(screen.getByTestId("product-filters-button"));
    const sheet = screen.getByTestId("product-filters-sheet");
    await waitFor(() => {
      expect(within(sheet).getByRole("alert")).toHaveTextContent(
        "We couldn't load the categories."
      );
    });
    healLists();
    await user.click(within(sheet).getByRole("button", { name: "Try again" }));

    expect(
      await within(sheet).findByRole("checkbox", { name: /Rings/u })
    ).toBeVisible();
    expect(within(sheet).queryByRole("alert")).toBeNull();
  });

  test("speaks Spanish", async () => {
    setup({
      answer: () =>
        makePage([makeItem(9, { title: null, titleLang: null })], {
          pageCount: 2,
          total: 25,
        }),
      locale: "es",
    });

    expect((await screen.findByTestId("product-list-count")).textContent).toBe(
      "25 artículos"
    );
    expect(screen.getByRole("heading", { name: "Artículos" })).toBeVisible();
    expect(screen.getByTestId("product-row-title")).toHaveTextContent(
      "Sin título"
    );
    expect(screen.getByTestId("product-list-range")).toHaveTextContent(
      "1–1 de 25"
    );
    expect(
      screen.getByRole("link", { name: "Nuevo artículo" })
    ).toHaveAttribute("href", "/admin/products/new");
  });
});
