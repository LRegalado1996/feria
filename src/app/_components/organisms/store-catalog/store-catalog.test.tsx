import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type {
  CatalogCategory,
  CatalogFilter,
} from "@/app/_components/molecules/store-catalog-filters";
import type { CatalogCover } from "@/lib/catalog/cover";
import { type CatalogQuery, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import type { CatalogPage } from "@/lib/hooks/catalog";
import type { Locale } from "@/lib/i18n/config";
import { createQueryClient } from "@/lib/orpc/query-client";
import { renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";
import { required } from "@/test/required";

import { StoreCatalog } from "./store-catalog";

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The app's client reports a failed query; that has its own tests.
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const CATEGORIES: CatalogCategory[] = [
  {
    depth: 0,
    lang: "es",
    name: "Collares",
    path: "/collares",
    slug: "collares",
  },
  { depth: 0, lang: "es", name: "Aros", path: "/aros", slug: "aros" },
];

const FILTERS: CatalogFilter[] = [
  {
    lang: "es",
    name: "Color",
    slug: "color",
    values: [
      {
        count: 2,
        lang: "es",
        name: "Dorado",
        slug: "dorado",
        swatchColor: null,
      },
      { count: 1, lang: "es", name: "Rojo", slug: "rojo", swatchColor: null },
    ],
  },
];

type CatalogItem = CatalogPage["items"][number];

function makeItem(
  id: number,
  overrides: Partial<CatalogItem> = {}
): CatalogItem {
  return {
    categorySlug: null,
    cover: {
      alt: `Foto del artículo ${id}`,
      height: 500,
      url: `/articulo-${id}.jpg`,
      width: 400,
    },
    currencyCode: "UYU",
    id,
    isAvailable: true,
    lang: "es",
    priceAmount: id * 1000,
    slug: `articulo-${id}`,
    title: `Artículo ${id}`,
    ...overrides,
  };
}
// The store's own order's cursor carries the place (FER-044).
const CURSOR = { id: 2, position: 2, sort: "position" as const };
// A price order's cursor carries the price.
const PRICE_CURSOR = { id: 2, priceAmount: 2000, sort: "price_asc" as const };

function makePage(
  items: CatalogItem[],
  nextCursor: CatalogPage["nextCursor"] = null
): CatalogPage {
  return { items, nextCursor };
}

function makeQuery(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { ...EMPTY_CATALOG_QUERY, ...overrides };
}

/** A selection of a category, a filter value and a search, by price. */
const CHOSEN = makeQuery({
  category: { path: "/collares", slug: "collares" },
  filters: [{ attribute: "color", values: ["dorado"] }],
  q: "perla",
  sort: "price_asc",
});

/** The cover of a page, a computer image and maybe a phone one. */
function makeCover(phone: CatalogCover["phone"] = null): CatalogCover {
  return {
    alt: "Anillo sello dorado",
    computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
    phone,
  };
}

interface SetupOptions {
  /** The page's cover (FER-043); none by default. */
  cover?: CatalogCover | null;
  firstPage?: CatalogPage;
  locale?: Locale;
  /**
   * How `catalog.products` answers the next page; `held` waits for the
   * test's `release()`.
   */
  next?: "fail" | "hang" | "held" | "ok";
  /** The next page `catalog.products` answers with. */
  nextPage?: CatalogPage;
  query?: CatalogQuery;
  /** Where the server's page started, when the address carried a cursor. */
  startCursor?: CatalogPage["nextCursor"];
}

function setup({
  cover = null,
  firstPage = makePage([makeItem(1), makeItem(2, { isAvailable: false })]),
  locale = "es",
  next = "ok",
  nextPage = makePage([makeItem(3)]),
  query = makeQuery(),
  startCursor = null,
}: SetupOptions = {}) {
  const releases: (() => void)[] = [];
  const held = new Promise<void>((resolve) => {
    releases.push(resolve);
  });
  const products = vi.fn(async (_input: unknown) => {
    if (next === "hang") {
      await new Promise<never>(() => {});
    }

    if (next === "held") {
      await held;
    }

    return nextPage;
  });
  server.use(
    next === "fail"
      ? createOrpcErrorHandler("catalog.products", {
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
          status: 500,
        })
      : createOrpcHandler("catalog.products", products)
  );
  const observers = stubIntersectionObserver();
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });

  function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  const user = userEvent.setup();
  const catalog = (next: CatalogQuery, page: CatalogPage) => (
    <StoreCatalog
      breadcrumb={{
        items: [{ href: "/", name: "Inicio" }, { name: "Collares" }],
        label: "Ruta",
      }}
      categories={CATEGORIES}
      cover={cover}
      filters={FILTERS}
      firstPage={page}
      heading="Collares"
      query={next}
      startCursor={startCursor}
    />
  );
  const view = renderWithI18n(catalog(query, firstPage), {
    locale,
    wrapper: Providers,
  });

  return {
    /** The link that asks for the next page, by its name. */
    more: (name = "Cargar más") => screen.getByRole("link", { name }),
    /**
     * Renders the catalog again for another selection, as the router does,
     * with that selection's first page (the same one unless given).
     */
    navigate: (next: CatalogQuery, page: CatalogPage = firstPage) => {
      view.rerender(catalog(next, page));
    },
    observers,
    products,
    /** Lets a `held` next page answer. */
    release: () => {
      for (const resolve of releases) {
        resolve();
      }
    },
    /** What the polite status line says. */
    status: () => screen.getByTestId("store-catalog-status"),
    /** The grid's article names, in order. */
    titles: () =>
      within(screen.getByTestId("store-catalog-grid"))
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    user,
  };
}

/** The links of the open sort menu, as name, address and whether current. */
function sortItems() {
  return within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => [
      item.textContent,
      item.getAttribute("href"),
      item.getAttribute("aria-current"),
    ]);
}

describe("StoreCatalog", () => {
  test("without a cover, is headed, centered, by the selection's name under its trail, with no description and no share button", () => {
    setup();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^Collares$/u);
    expect(heading).toHaveClass("font-display", "store-display-page");
    expect(heading.parentElement).toHaveClass("items-center", "text-center");
    // The trail first, then the title, and nothing else in the header.
    const header = required(heading.closest("header"));
    expect(header.firstElementChild).toBe(
      screen.getByRole("navigation", { name: "Ruta" })
    );
    expect(heading.nextElementSibling).toBeNull();
    expect(header).not.toHaveTextContent("LR Market");
    expect(screen.queryByRole("button", { name: "Compartir" })).toBeNull();
    // Without a cover, the plain title: no photo.
    expect(screen.queryByTestId("store-catalog-cover")).toBeNull();
  });

  test("leads home from a house named Inicio, then each step a link but the page itself (FER-043, FER-044)", () => {
    setup();

    const trail = screen.getByRole("navigation", { name: "Ruta" });
    const home = within(trail).getByRole("link", { name: "Inicio" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(within(home).getByText("Inicio")).toHaveClass("sr-only");
    expect(within(trail).getByText("Collares")).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test.each([
    [
      "a phone image, which shows below md",
      { height: 1200, url: "/seed/ring-1.jpg", width: 1000 },
      "/seed/ring-1.jpg",
      ["(min-width: 768px)"],
    ],
    [
      "no phone image: the computer one everywhere",
      null,
      "/seed/ring-2.jpg",
      [],
    ],
  ])(
    "with a cover and %s, opens on it, the window's width and nearly its height, the page's h1 over it, fetched first",
    (_case, phone, phoneSrc, computerMedia) => {
      setup({ cover: makeCover(phone) });

      const cover = screen.getByTestId("store-catalog-cover");
      const image = within(cover).getByRole("img", {
        name: "Anillo sello dorado",
      });
      // Its measure in its own letters: a word breaks only when it must.
      expect(
        within(cover).getByRole("heading", { level: 1, name: "Collares" })
      ).toHaveClass("max-w-[18ch]");
      expect(image.getAttribute("src")).toContain(encodeURIComponent(phoneSrc));
      expect(image).toHaveAttribute("fetchpriority", "high");
      expect(image).toHaveAttribute("loading", "eager");
      expect(image).toHaveAttribute("sizes", "100vw");
      expect(
        [...cover.querySelectorAll("source")].map((source) =>
          source.getAttribute("media")
        )
      ).toEqual(computerMedia);
      // Attached to the header: the first thing on the page, the trail
      // under it.
      const header = required(cover.closest("header"));
      expect(header.firstElementChild).toBe(cover);
      expect(cover.nextElementSibling).toBe(
        screen.getByRole("navigation", { name: "Ruta" })
      );
      // One h1 on the page: the plain title is not drawn as well.
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    }
  );

  test("serves the computer image from md up when the cover has a phone one", () => {
    setup({
      cover: makeCover({ height: 1200, url: "/seed/ring-1.jpg", width: 1000 }),
    });

    const source = required(
      screen.getByTestId("store-catalog-cover").querySelector("source")
    );
    expect(source.getAttribute("srcset")).toContain(
      encodeURIComponent("/seed/ring-2.jpg")
    );
    expect(source.getAttribute("srcset")).not.toContain(
      encodeURIComponent("/seed/ring-1.jpg")
    );
  });

  test.each([
    ["es", "position", "Ordenar por"],
    ["en", "position", "Sort by"],
    ["es", "newest", "Ordenar por: Más nuevos"],
    ["en", "price_desc", "Sort by: Price: high to low"],
  ] as const)(
    "in %s, with the %s sort, names the sort's button %j",
    (locale, sort, name) => {
      setup({ locale, query: makeQuery({ sort }) });

      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-haspopup",
        "menu"
      );
    }
  );

  test("opens the four sorts as links, the current one marked, keeping the selection", async () => {
    const { user } = setup({ query: CHOSEN });

    await user.click(
      screen.getByRole("button", { name: "Ordenar por: Precio: menor a mayor" })
    );

    expect(sortItems()).toEqual([
      ["Destacados", "/collares?color=dorado&q=perla", null],
      [
        "Precio: menor a mayor",
        "/collares?color=dorado&q=perla&sort=price_asc",
        "true",
      ],
      [
        "Precio: mayor a menor",
        "/collares?color=dorado&q=perla&sort=price_desc",
        null,
      ],
      ["Más nuevos", "/collares?color=dorado&q=perla&sort=newest", null],
    ]);
    // Only the current one carries the tick.
    const [featured, cheapest] = within(screen.getByRole("menu")).getAllByRole(
      "menuitem"
    );
    expect(featured?.querySelector("svg")).toBeNull();
    expect(cheapest?.querySelector("svg")).not.toBeNull();
  });

  test("in English, names the sorts in English and marks none for the store's own order", async () => {
    const { user } = setup({ locale: "en" });

    await user.click(screen.getByRole("button", { name: "Sort by" }));

    expect(sortItems()).toEqual([
      ["Featured", "/en/productos", null],
      ["Price: low to high", "/en/productos?sort=price_asc", null],
      ["Price: high to low", "/en/productos?sort=price_desc", null],
      ["Newest", "/en/productos?sort=newest", null],
    ]);
    expect(
      within(screen.getByRole("menu")).getAllByRole("menuitem")[0]
    ).not.toContainHTML("svg");
  });

  test("the sort's menu opens from the keyboard and Escape closes it, handing focus back", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button", { name: "Ordenar por" });
    trigger.focus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("opens its choices in a panel named Filtrar, closed by its close button", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button", { name: "Filtrar" });

    await user.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Filtrar" });
    expect(panel).toBe(screen.getByTestId("store-catalog-panel"));
    expect(
      within(panel).getByRole("navigation", { name: "Categorías" })
    ).toBeVisible();
    // Focus is trapped inside, on its first control.
    expect(
      within(panel).getByRole("button", { name: "Cerrar los filtros" })
    ).toHaveFocus();

    await user.click(
      within(panel).getByRole("button", { name: "Cerrar los filtros" })
    );
    await waitFor(() => {
      expect(screen.queryByTestId("store-catalog-panel")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("the panel's show-results button closes it, and Escape does too", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button", { name: "Filtrar" });

    await user.click(trigger);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Ver resultados",
      })
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("the panel is a sheet from the bottom on a phone and a drawer from the left from a tablet up, over a scrim", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    const panel = screen.getByTestId("store-catalog-panel");
    expect(panel).toHaveClass(
      "bottom-0",
      "h-[86dvh]",
      "rounded-t-2xl",
      "md:inset-y-0",
      "md:max-w-100",
      "md:rounded-none"
    );
    expect(panel).toHaveAttribute("data-slot", "dialog-content");
    expect(screen.getByTestId("dialog-overlay")).toHaveClass(
      "bg-store-foreground/50"
    );
  });

  test("following a filter in the panel leaves it open, and the new selection shows in it", async () => {
    const { navigate, user } = setup();
    const trigger = screen.getByRole("button", { name: "Filtrar" });
    await user.click(trigger);
    const panel = screen.getByTestId("store-catalog-panel");

    await user.click(within(panel).getByRole("link", { name: /^Dorado/u }));
    expect(screen.getByTestId("store-catalog-panel")).toBe(panel);

    // The router renders the catalog again for the address it followed.
    navigate(
      makeQuery({ filters: [{ attribute: "color", values: ["dorado"] }] })
    );

    expect(screen.getByTestId("store-catalog-panel")).toBe(panel);
    expect(
      within(panel).getByRole("link", { name: /^Dorado/u })
    ).toHaveAttribute("aria-current", "true");
    // Behind the open panel (hidden from a screen reader while it is open),
    // its button already counts the new choice: the eye's count and the
    // words a screen reader hears once the panel closes.
    expect(trigger).toHaveTextContent(
      /^Filtrar \(1\)Filtrar, 1 filtro elegido$/u
    );
  });

  test("following a category in the panel closes it at once: the category is another page (FER-043)", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    await user.click(
      within(screen.getByTestId("store-catalog-panel")).getByRole("link", {
        name: "Aros",
      })
    );

    expect(screen.queryByTestId("store-catalog-panel")).toBeNull();
    // No exit animation leaves the scrim behind on the page left behind.
    expect(screen.queryByTestId("dialog-overlay")).toBeNull();
  });

  test("the panel offers to clear what is chosen, keeping the sort, only when something is", async () => {
    const chosen = setup({ query: CHOSEN });
    await chosen.user.click(
      screen.getByRole("button", { name: "Filtrar, 1 filtro elegido" })
    );

    expect(
      within(screen.getByRole("dialog")).getByRole("link", { name: "Limpiar" })
    ).toHaveAttribute("href", "/productos?sort=price_asc");
  });

  test("the panel has nothing to clear with nothing chosen", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(
      within(screen.getByRole("dialog")).queryByRole("link", {
        name: "Limpiar",
      })
    ).toBeNull();
  });

  test.each([
    ["es", "no filter", [], "Filtrar", "Filtrar"],
    ["es", "one value", ["dorado"], "Filtrar (1)", "Filtrar, 1 filtro elegido"],
    [
      "es",
      "two values",
      ["dorado", "rojo"],
      "Filtrar (2)",
      "Filtrar, 2 filtros elegidos",
    ],
    ["en", "one value", ["dorado"], "Filter (1)", "Filter, 1 filter chosen"],
    [
      "en",
      "two values",
      ["dorado", "rojo"],
      "Filter (2)",
      "Filter, 2 filters chosen",
    ],
  ] as const)(
    "in %s, with %s chosen, the panel's button reads %j and is named %j",
    (locale, _case, values, shown, name) => {
      setup({
        locale,
        query: makeQuery({
          filters:
            values.length > 0
              ? [{ attribute: "color", values: [...values] }]
              : [],
        }),
      });

      const trigger = screen.getByRole("button", { name });
      expect(trigger).toBe(screen.getByTestId("store-catalog-filter"));
      // What the eye reads; a screen reader hears the name instead.
      const visible = [...trigger.querySelectorAll("span")].filter(
        (span) => !span.classList.contains("sr-only")
      );
      expect(visible.map((span) => span.textContent)).toEqual([shown]);
    }
  );

  test("the panel's button counts the filters' values only, never the page's category or a search", () => {
    setup({ query: CHOSEN });

    expect(
      screen.getByRole("button", { name: "Filtrar, 1 filtro elegido" })
    ).toBeVisible();
  });

  test("lists no chosen choice under the bar: no pills and no clear-all (FER-044)", () => {
    setup({ query: CHOSEN });

    expect(screen.queryByRole("link", { name: /^Quitar/u })).toBeNull();
    expect(screen.queryByRole("link", { name: "Limpiar todo" })).toBeNull();
    // Right under the bar, the grid: nothing between them.
    expect(
      screen.getByTestId("store-catalog-grid").parentElement
        ?.previousElementSibling
    ).toHaveAttribute("data-slot", "store-catalog-bar");
  });

  test("lists the articles as cards in a grid of one column on a phone, two from sm (a tablet), four from lg (a computer)", () => {
    const { titles } = setup();

    expect(titles()).toEqual(["Artículo 1", "Artículo 2"]);
    const grid = screen.getByTestId("store-catalog-grid");
    expect(grid).toHaveClass("grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-4");
    // One column below `sm`: nothing sets two there (FER-050).
    expect(grid).not.toHaveClass("grid-cols-2");
    // The photo asks for the whole width on a phone, half from `sm`.
    expect(
      within(grid).getByRole("img", { name: "Foto del artículo 1" })
    ).toHaveAttribute(
      "sizes",
      "(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
    );
  });

  test("a card is a link with nothing to add, available or sold out; a sold-out one says so", () => {
    setup();

    const grid = within(screen.getByTestId("store-catalog-grid"));
    const [first, second] = grid.getAllByRole("article");
    const link = within(first ?? document.body).getByRole("link", {
      name: "Artículo 1",
    });
    expect(link).toHaveAttribute("href", "/productos/articulo-1");
    // The name's language is on its link; the card keeps the page's.
    expect(link).toHaveAttribute("lang", "es");
    expect(first?.closest("li")).not.toHaveAttribute("lang");
    expect(within(first ?? document.body).queryByRole("button")).toBeNull();
    expect(within(second ?? document.body).queryByRole("button")).toBeNull();
    expect(second).toHaveTextContent("Agotado");
    expect(first).not.toHaveTextContent("Agotado");
  });

  test("in English, links the cards to the English pages and says sold out in English", () => {
    setup({ locale: "en" });

    const grid = within(screen.getByTestId("store-catalog-grid"));
    expect(grid.getByRole("link", { name: "Artículo 1" })).toHaveAttribute(
      "href",
      "/en/productos/articulo-1"
    );
    expect(grid.getByText("Sold out")).toBeVisible();
  });

  test("a card with no photo says so", () => {
    setup({
      firstPage: makePage([{ ...makeItem(1), cover: null }]),
    });

    expect(screen.getByText("Sin foto")).toBeVisible();
  });

  test("a store with no articles yet says so, with nothing to clear", () => {
    setup({ firstPage: makePage([]) });

    const empty = screen.getByTestId("store-catalog-empty");
    expect(within(empty).getByRole("heading")).toHaveTextContent(
      /^Todavía no hay artículos$/u
    );
    expect(empty).toHaveTextContent(
      "Volvé pronto: la tienda está cargando su catálogo."
    );
    expect(within(empty).queryByRole("link")).toBeNull();
    expect(screen.queryByTestId("store-catalog-grid")).toBeNull();
  });

  test("a selection with no articles says nothing was found and leads to the whole catalog", () => {
    setup({ firstPage: makePage([]), query: CHOSEN });

    const empty = screen.getByTestId("store-catalog-empty");
    expect(within(empty).getByRole("heading")).toHaveTextContent(
      /^No encontramos nada$/u
    );
    expect(empty).toHaveTextContent(
      "Probá con otra búsqueda o quitá algún filtro."
    );
    const way = within(empty).getByRole("link", {
      name: "Ver todo el catálogo",
    });
    expect(way).toHaveAttribute("href", "/productos?sort=price_asc");
    expect(way).toHaveAttribute("data-slot", "store-button");
  });

  test("shows no load more when there is no next page", () => {
    const { status } = setup();

    expect(screen.queryByRole("link", { name: "Cargar más" })).toBeNull();
    expect(status()).toHaveTextContent(/^$/u);
  });

  test.each([
    ["the store's order", makeQuery(), CURSOR, "/productos?cursor=2.2"],
    [
      "a whole selection by price",
      CHOSEN,
      PRICE_CURSOR,
      "/collares?color=dorado&q=perla&sort=price_asc&cursor=2000.2",
    ],
  ] as const)(
    "with %s, load more is a real link to the next page, for a visitor without the script",
    (_case, query, cursor, href) => {
      const { more } = setup({
        firstPage: makePage([makeItem(1), makeItem(2)], cursor),
        query,
      });

      expect(more()).toHaveAttribute("href", href);
      expect(more()).toHaveAttribute("data-slot", "store-button");
    }
  );

  test("in English, the link leads to the English page", () => {
    const { more } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      locale: "en",
    });

    expect(more("Load more")).toHaveAttribute(
      "href",
      "/en/productos?cursor=2.2"
    );
  });

  test("with the script, loads the next page in place, with the whole selection, then the link is gone", async () => {
    const { more, products, titles, user } = setup({
      firstPage: makePage([makeItem(1), makeItem(2)], PRICE_CURSOR),
      query: CHOSEN,
    });
    // Read once React's own handler ran: the link is not followed.
    const followed: boolean[] = [];
    document.addEventListener(
      "click",
      (event) => {
        followed.push(!event.defaultPrevented);
      },
      { once: true }
    );

    await user.click(more());
    expect(followed).toEqual([false]);

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 2", "Artículo 3"]);
    });
    expect(products).toHaveBeenCalledExactlyOnceWith({
      category: "collares",
      cursor: PRICE_CURSOR,
      filters: [{ attribute: "color", values: ["dorado"] }],
      locale: "es",
      q: "perla",
      sort: "price_asc",
    });
    expect(screen.queryByRole("link", { name: "Cargar más" })).toBeNull();
  });

  test("leaves a click that opens elsewhere to the browser, loading nothing", async () => {
    const { more, products, user } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
    });
    const link = more();
    // A new tab is the browser's own business; this page does not follow it.
    link.addEventListener("click", (event) => {
      event.preventDefault();
    });

    await user.keyboard("{Control>}");
    await user.click(link);
    await user.keyboard("{/Control}");

    expect(products).not.toHaveBeenCalled();
  });

  test("a page that started further down (the link followed without the script) loads the one after it", async () => {
    const { more, products, user } = setup({
      firstPage: makePage([makeItem(4)], { ...CURSOR, id: 4, position: 4 }),
      startCursor: CURSOR,
    });

    await user.click(more());

    await waitFor(() => {
      expect(products).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          cursor: { id: 4, position: 4, sort: "position" },
        })
      );
    });
  });

  test("says it is loading and ignores presses meanwhile, keeping its focus", async () => {
    const { more, products, user } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      next: "hang",
    });

    await user.click(more());

    const loading = await screen.findByRole("link", { name: "Cargando…" });
    expect(loading).toHaveAttribute("aria-disabled", "true");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveFocus();
    await user.click(loading);
    expect(products).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ cursor: CURSOR })
    );
  });

  test.each([
    [
      "es",
      makePage([makeItem(3), makeItem(4)], { ...CURSOR, id: 4, position: 4 }),
      "Se cargaron 2 artículos más; ya ves 4.",
    ],
    [
      "es",
      makePage([makeItem(3)]),
      "Se cargó 1 artículo más; ya ves 3. Ya están todos.",
    ],
    [
      "en",
      makePage([makeItem(3), makeItem(4)]),
      "2 more articles loaded; showing 4. That is all of them.",
    ],
  ] as const)(
    "in %s, says politely what each page brought and when the list ends",
    async (locale, nextPage, said) => {
      const { observers, status, titles } = setup({
        firstPage: makePage([makeItem(1), makeItem(2)], CURSOR),
        locale,
        nextPage,
      });
      expect(status().tagName).toBe("OUTPUT");
      expect(status()).toHaveClass("sr-only");

      observers.active()?.emit(true);

      await waitFor(() => {
        expect(titles()).toHaveLength(nextPage.items.length + 2);
      });
      expect(status()).toHaveTextContent(said);
    }
  );

  test("moves focus to the first new card once a page asked for with the link lands", async () => {
    const { more, titles, user } = setup({
      firstPage: makePage([makeItem(1), makeItem(2)], CURSOR),
    });
    expect(more()).toHaveAttribute("aria-disabled", "false");

    await user.click(more());

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 2", "Artículo 3"]);
    });
    expect(screen.getByRole("link", { name: "Artículo 3" })).toHaveFocus();
  });

  test("forgets a press of load more once the selection changes, leaving focus on the link", async () => {
    const { more, navigate, titles, user } = setup({
      firstPage: makePage([makeItem(1), makeItem(2)], CURSOR),
      next: "hang",
    });
    await user.click(more());
    await screen.findByRole("link", { name: "Cargando…" });

    // Another selection's first page is longer than the one pressed in.
    navigate(
      makeQuery({ sort: "price_desc" }),
      makePage([makeItem(4), makeItem(5), makeItem(6)], {
        ...PRICE_CURSOR,
        sort: "price_desc",
      })
    );

    expect(titles()).toEqual(["Artículo 4", "Artículo 5", "Artículo 6"]);
    expect(more()).toHaveFocus();
  });

  test("leaves focus where the shopper took it while a page asked for with the link loaded", async () => {
    const { more, release, titles, user } = setup({
      firstPage: makePage([makeItem(1), makeItem(2)], CURSOR),
      next: "held",
    });
    await user.click(more());
    await screen.findByRole("link", { name: "Cargando…" });
    const filter = screen.getByRole("button", { name: "Filtrar" });

    act(() => {
      filter.focus();
    });
    release();

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 2", "Artículo 3"]);
    });
    expect(filter).toHaveFocus();
  });

  test("moves focus to the retry when a page asked for with the link fails", async () => {
    const { more, user } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      next: "fail",
    });

    await user.click(more());

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("button", { name: "Probar de nuevo" })
    ).toHaveFocus();
  });

  test("leaves focus alone when a page asked for by scrolling fails, even from a focused link", async () => {
    const { more, observers } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      next: "fail",
    });
    more().focus();

    observers.active()?.emit(true);

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("button", { name: "Probar de nuevo" })
    ).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  test("leaves focus alone when a page arrives by scrolling", async () => {
    const { observers, titles } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
    });
    const filter = screen.getByRole("button", { name: "Filtrar" });
    filter.focus();

    observers.active()?.emit(true);

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 3"]);
    });
    expect(filter).toHaveFocus();
  });

  test("loads the next page by itself as the end of the grid nears the window, and stops pulling once the list ends", async () => {
    const { more, observers, titles } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
    });

    const observer = observers.active();
    expect(observer?.observed).toEqual([more().parentElement]);
    // Well before the end reaches the window.
    expect(observer?.rootMargin).toBe("0px 0px 800px 0px");
    observer?.emit(true);

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 3"]);
    });
    // No page follows: nothing is watched, so the footer stays in reach.
    expect(observers.active()).toBeUndefined();
    expect(screen.queryByRole("link", { name: "Cargar más" })).toBeNull();
  });

  test("a next page that failed says so in an alert and loads again on retry", async () => {
    const { more, products, titles, user } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      next: "fail",
    });

    await user.click(more());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /^No pudimos cargar más artículos\.Probar de nuevo$/u
    );
    expect(screen.queryByRole("link", { name: "Cargar más" })).toBeNull();

    server.use(createOrpcHandler("catalog.products", products));
    await user.click(
      within(alert).getByRole("button", { name: "Probar de nuevo" })
    );

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 3"]);
    });
    expect(screen.queryByRole("alert")).toBeNull();
    // The retry went with the alert: the page it asked for takes focus.
    expect(screen.getByRole("link", { name: "Artículo 3" })).toHaveFocus();
  });
});
