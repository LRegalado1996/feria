import { QueryClientProvider } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

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

const CURSOR = {
  id: 2,
  publishedAt: "2026-11-01T12:00:00.000Z",
  sort: "newest" as const,
};
// A price order's cursor carries the price, not the date.
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
  query?: CatalogQuery;
}

function setup({
  cover = null,
  firstPage = makePage([makeItem(1), makeItem(2, { isAvailable: false })]),
  locale = "es",
  next = "ok",
  query = makeQuery(),
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

    return makePage([makeItem(3)]);
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
      description="Todos los artículos de LR Market."
      filters={FILTERS}
      firstPage={page}
      heading="Collares"
      query={next}
    />
  );
  const view = renderWithI18n(catalog(query, firstPage), {
    locale,
    wrapper: Providers,
  });

  return {
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

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("StoreCatalog", () => {
  test("is headed, centered, by the selection's name and one line about it, with the share button", () => {
    setup();

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent(/^Collares$/u);
    expect(heading).toHaveClass("font-display", "store-display-page");
    expect(heading.parentElement).toHaveClass("items-center", "text-center");
    expect(heading.nextElementSibling).toHaveTextContent(
      /^Todos los artículos de LR Market\.$/u
    );
    expect(screen.getByRole("button", { name: "Compartir" })).toBeVisible();
    // Without a cover, the plain title: no photo.
    expect(screen.queryByTestId("store-catalog-cover")).toBeNull();
  });

  test("starts with the trail to the page, every step a link but the page itself (FER-043)", () => {
    setup();

    const trail = screen.getByRole("navigation", { name: "Ruta" });
    expect(
      within(trail)
        .getAllByRole("listitem")
        .map((item) => [
          item.textContent,
          item.querySelector("a")?.getAttribute("href") ?? null,
        ])
    ).toEqual([
      ["Inicio", "/"],
      ["Collares", null],
    ]);
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
    "with a cover and %s, puts the page's h1 over the photo, fetched first",
    (_case, phone, phoneSrc, computerMedia) => {
      setup({
        cover: {
          alt: "Anillo sello dorado",
          computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
          phone,
        },
      });

      const cover = screen.getByTestId("store-catalog-cover");
      const image = within(cover).getByRole("img", {
        name: "Anillo sello dorado",
      });
      expect(
        within(cover).getByRole("heading", { level: 1, name: "Collares" })
      ).toBeVisible();
      expect(image.getAttribute("src")).toContain(encodeURIComponent(phoneSrc));
      expect(image).toHaveAttribute("fetchpriority", "high");
      expect(image).toHaveAttribute("loading", "eager");
      expect(image).toHaveAttribute("sizes", "100vw");
      expect(
        [...cover.querySelectorAll("source")].map((source) =>
          source.getAttribute("media")
        )
      ).toEqual(computerMedia);
      expect(cover).toHaveClass("aspect-square", "md:aspect-3/1");
      // One h1 on the page: the plain title is not drawn as well.
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    }
  );

  test("serves the computer image from md up when the cover has a phone one", () => {
    setup({
      cover: {
        alt: "Anillos",
        computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
        phone: { height: 1200, url: "/seed/ring-1.jpg", width: 1000 },
      },
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
    ["es", "Ordenar por: Más nuevos"],
    ["en", "Sort by: Newest"],
  ] as const)(
    "in %s, names the sort's button after the current sort: %j",
    (locale, name) => {
      setup({ locale });

      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-haspopup",
        "menu"
      );
    }
  );

  test("opens the three sorts as links, the current one marked, keeping the selection", async () => {
    const { user } = setup({ query: CHOSEN });

    await user.click(
      screen.getByRole("button", { name: "Ordenar por: Precio: menor a mayor" })
    );

    expect(sortItems()).toEqual([
      ["Más nuevos", "/collares?color=dorado&q=perla", null],
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
    ]);
    // Only the current one carries the tick.
    const [newest, cheapest] = within(screen.getByRole("menu")).getAllByRole(
      "menuitem"
    );
    expect(newest?.querySelector("svg")).toBeNull();
    expect(cheapest?.querySelector("svg")).not.toBeNull();
  });

  test("in English, names the sorts in English and marks the newest by default", async () => {
    const { user } = setup({ locale: "en" });

    await user.click(screen.getByRole("button", { name: "Sort by: Newest" }));

    expect(sortItems()).toEqual([
      ["Newest", "/en/productos", "true"],
      ["Price: low to high", "/en/productos?sort=price_asc", null],
      ["Price: high to low", "/en/productos?sort=price_desc", null],
    ]);
  });

  test("the sort's menu opens from the keyboard and Escape closes it, handing focus back", async () => {
    const { user } = setup();
    const trigger = screen.getByRole("button", {
      name: "Ordenar por: Más nuevos",
    });
    trigger.focus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeVisible();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull();
    });
    expect(trigger).toHaveFocus();
  });

  test("shares the selection's own link", async () => {
    const writeText = vi.fn(async (_text: string) => {});
    const { user } = setup({ query: CHOSEN });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:3000/collares?color=dorado&q=perla&sort=price_asc"
    );
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
    // its button already counts the new choice.
    expect(trigger).toHaveTextContent(/^Filtrar \(1\)$/u);
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
      screen.getByRole("button", { name: "Filtrar (2)" })
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

  test("the panel's button counts the chosen category and filter values, not the search", () => {
    setup({ query: CHOSEN });

    expect(
      screen.getByRole("button", { name: "Filtrar (2)" })
    ).toBeInTheDocument();
  });

  test("shows each choice as a chip that leads to the selection without it, and a clear-all", () => {
    setup({ query: CHOSEN });

    const chips = within(
      screen.getByRole("heading", { name: "Filtros elegidos" }).parentElement ??
        document.body
    );
    expect(
      chips
        .getAllByRole("link")
        .map((link) => [
          link.getAttribute("aria-label") ?? link.textContent,
          link.getAttribute("href"),
        ])
    ).toEqual([
      ["Quitar: Collares", "/productos?color=dorado&q=perla&sort=price_asc"],
      ["Quitar: Dorado", "/collares?q=perla&sort=price_asc"],
      ["Quitar: perla", "/collares?color=dorado&sort=price_asc"],
      ["Limpiar todo", "/productos?sort=price_asc"],
    ]);
  });

  test("leaves out chips for choices the store does not have, and shows none with nothing chosen", () => {
    setup({
      query: makeQuery({
        category: { path: "/anillos", slug: "anillos" },
        filters: [
          { attribute: "color", values: ["verde"] },
          { attribute: "talle", values: ["m"] },
        ],
      }),
    });

    expect(
      screen.queryByRole("heading", { name: "Filtros elegidos" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Filtrar" })).toBeVisible();
  });

  test("lists the articles as cards in a grid of two columns, four from a tablet up", () => {
    const { titles } = setup();

    expect(titles()).toEqual(["Artículo 1", "Artículo 2"]);
    expect(screen.getByTestId("store-catalog-grid")).toHaveClass(
      "grid-cols-2",
      "md:grid-cols-4"
    );
    expect(
      within(screen.getByTestId("store-catalog-grid")).getByRole("img", {
        name: "Foto del artículo 1",
      })
    ).toHaveAttribute("sizes", "(min-width: 768px) 25vw, 50vw");
  });

  test("an available card has an add button, a sold-out one says so instead", () => {
    setup();

    const grid = within(screen.getByTestId("store-catalog-grid"));
    const [first, second] = grid.getAllByRole("article");
    const link = within(first ?? document.body).getByRole("link", {
      name: "Artículo 1",
    });
    expect(link).toHaveAttribute("href", "/products/articulo-1");
    // The name's language is on its link; the card keeps the page's.
    expect(link).toHaveAttribute("lang", "es");
    expect(first?.closest("li")).not.toHaveAttribute("lang");
    expect(
      within(first ?? document.body).getByRole("button", {
        name: "Agregar al carrito: Artículo 1",
      })
    ).toBeVisible();
    expect(within(second ?? document.body).queryByRole("button")).toBeNull();
    expect(second).toHaveTextContent("Agotado");
    expect(first).not.toHaveTextContent("Agotado");
  });

  test("in English, links the cards to the English pages and names the button in English", () => {
    setup({ locale: "en" });

    const grid = within(screen.getByTestId("store-catalog-grid"));
    expect(grid.getByRole("link", { name: "Artículo 1" })).toHaveAttribute(
      "href",
      "/en/products/articulo-1"
    );
    expect(
      grid.getByRole("button", { name: "Add to cart: Artículo 1" })
    ).toBeVisible();
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
    setup();

    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  test("loads the next page with its button, with the whole selection", async () => {
    const { products, titles, user } = setup({
      firstPage: makePage([makeItem(1), makeItem(2)], PRICE_CURSOR),
      query: CHOSEN,
    });

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

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
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  test("says it is loading and ignores presses meanwhile, keeping its focus", async () => {
    const { products, user } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      next: "hang",
    });

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    const loading = await screen.findByRole("button", { name: "Cargando…" });
    expect(loading).toBeEnabled();
    expect(loading).toHaveAttribute("aria-disabled", "true");
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveFocus();
    await user.click(loading);
    expect(products).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ cursor: CURSOR })
    );
  });

  test("moves focus to the first new card once a page asked for with the button lands", async () => {
    const { titles, user } = setup({
      firstPage: makePage([makeItem(1), makeItem(2)], CURSOR),
    });
    const button = screen.getByRole("button", { name: "Cargar más" });
    expect(button).toHaveAttribute("aria-disabled", "false");

    await user.click(button);

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 2", "Artículo 3"]);
    });
    expect(screen.getByRole("link", { name: "Artículo 3" })).toHaveFocus();
  });

  test("forgets a press of load more once the selection changes, leaving focus on the button", async () => {
    const { navigate, titles, user } = setup({
      firstPage: makePage([makeItem(1), makeItem(2)], CURSOR),
      next: "hang",
    });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    await screen.findByRole("button", { name: "Cargando…" });

    // Another selection's first page is longer than the one pressed in.
    navigate(
      makeQuery({ sort: "price_desc" }),
      makePage([makeItem(4), makeItem(5), makeItem(6)], {
        ...PRICE_CURSOR,
        sort: "price_desc",
      })
    );

    expect(titles()).toEqual(["Artículo 4", "Artículo 5", "Artículo 6"]);
    expect(screen.getByRole("button", { name: "Cargar más" })).toHaveFocus();
  });

  test("leaves focus where the shopper took it while a page asked for with the button loaded", async () => {
    const { release, titles, user } = setup({
      firstPage: makePage([makeItem(1), makeItem(2)], CURSOR),
      next: "held",
    });
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    await screen.findByRole("button", { name: "Cargando…" });
    const share = screen.getByRole("button", { name: "Compartir" });

    act(() => {
      share.focus();
    });
    release();

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 2", "Artículo 3"]);
    });
    expect(share).toHaveFocus();
  });

  test("moves focus to the retry when a page asked for with the button fails", async () => {
    const { user } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      next: "fail",
    });

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("button", { name: "Probar de nuevo" })
    ).toHaveFocus();
  });

  test("leaves focus alone when a page asked for by scrolling fails, even from a focused button", async () => {
    const { observers } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      next: "fail",
    });
    screen.getByRole("button", { name: "Cargar más" }).focus();

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
    const share = screen.getByRole("button", { name: "Compartir" });
    share.focus();

    observers.active()?.emit(true);

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 3"]);
    });
    expect(share).toHaveFocus();
  });

  test("loads the next page when the end of the grid scrolls into view", async () => {
    const { observers, titles } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
    });

    const observer = observers.active();
    expect(observer?.observed).toEqual([
      screen.getByRole("button", { name: "Cargar más" }).parentElement,
    ]);
    observer?.emit(true);

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 3"]);
    });
  });

  test("a next page that failed says so in an alert and loads again on retry", async () => {
    const { products, titles, user } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
      next: "fail",
    });

    await user.click(screen.getByRole("button", { name: "Cargar más" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      /^No pudimos cargar más artículos\.Probar de nuevo$/u
    );
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();

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
