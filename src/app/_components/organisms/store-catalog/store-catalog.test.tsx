import { QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CatalogCategory,
  CatalogFilter,
} from "@/app/_components/molecules/store-catalog-filters";
import { type CatalogQuery, EMPTY_CATALOG_QUERY } from "@/lib/catalog/query";
import type { CatalogPage } from "@/lib/hooks/catalog";
import type { Locale } from "@/lib/i18n/config";
import { createQueryClient } from "@/lib/orpc/query-client";
import { renderWithI18n } from "@/test/i18n";
import { stubIntersectionObserver } from "@/test/intersection-observer";
import { createOrpcErrorHandler, createOrpcHandler, server } from "@/test/msw";

import { StoreCatalog } from "./store-catalog";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

// The search navigates with the router; it has its own tests.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

vi.mock("@/lib/orpc/client", async () => {
  const { orpcClientMock } = await import("@/test/mocks/orpc-client");
  return orpcClientMock;
});

// The app's client reports a failed query; that has its own tests.
vi.mock("@/lib/errors/client", () => ({ reportError: vi.fn() }));

const CATEGORIES: CatalogCategory[] = [
  { lang: "es", name: "Collares", slug: "collares" },
  { lang: "es", name: "Aros", slug: "aros" },
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

const CURSOR = { id: 2, publishedAt: "2026-11-01T12:00:00.000Z" };
// A price order's cursor carries the price, not the date.
const PRICE_CURSOR = { id: 2, priceAmount: 2000 };

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
  category: "collares",
  filters: [{ attribute: "color", values: ["dorado"] }],
  q: "perla",
  sort: "price_asc",
});

interface SetupOptions {
  firstPage?: CatalogPage;
  locale?: Locale;
  /** How `catalog.products` answers the next page. */
  next?: "fail" | "hang" | "ok";
  query?: CatalogQuery;
}

function setup({
  firstPage = makePage([makeItem(1), makeItem(2, { isAvailable: false })]),
  locale = "es",
  next = "ok",
  query = makeQuery(),
}: SetupOptions = {}) {
  const products = vi.fn(async (_input: unknown) =>
    next === "hang"
      ? await new Promise<never>(() => {})
      : makePage([makeItem(3)])
  );
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
  const catalog = (next: CatalogQuery) => (
    <StoreCatalog
      categories={CATEGORIES}
      filters={FILTERS}
      firstPage={firstPage}
      heading="Collares"
      query={next}
      storeSlug="lr-market"
    />
  );
  const view = renderWithI18n(catalog(query), { locale, wrapper: Providers });

  return {
    /** Renders the catalog again for another selection, as the router does. */
    navigate: (next: CatalogQuery) => {
      view.rerender(catalog(next));
    },
    observers,
    products,
    /** The grid's article names, in order. */
    titles: () =>
      within(screen.getByTestId("store-catalog-grid"))
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    user,
  };
}

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("StoreCatalog", () => {
  test("is headed by the selection's name, with the share button beside it", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Collares$/u
    );
    expect(screen.getByRole("button", { name: "Compartir" })).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Buscar artículos" })
    ).toBeVisible();
  });

  test("offers the three sorts as links, the current one marked, keeping the selection", () => {
    setup({ query: CHOSEN });

    const sorts = within(screen.getByRole("navigation", { name: "Ordenar" }));
    expect(
      sorts
        .getAllByRole("link")
        .map((link) => [
          link.textContent,
          link.getAttribute("href"),
          link.getAttribute("aria-current"),
        ])
    ).toEqual([
      [
        "Más nuevos",
        "/lr-market/products?category=collares&color=dorado&q=perla",
        null,
      ],
      [
        "Precio: menor a mayor",
        "/lr-market/products?category=collares&color=dorado&q=perla&sort=price_asc",
        "true",
      ],
      [
        "Precio: mayor a menor",
        "/lr-market/products?category=collares&color=dorado&q=perla&sort=price_desc",
        null,
      ],
    ]);
  });

  test("in English, names the sorts in English and marks the newest by default", () => {
    setup({ locale: "en" });

    const sorts = within(screen.getByRole("navigation", { name: "Sort" }));
    expect(sorts.getByRole("link", { name: "Newest" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(
      sorts.getByRole("link", { name: "Price: low to high" })
    ).toHaveAttribute("href", "/en/lr-market/products?sort=price_asc");
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
      "http://localhost:3000/lr-market/products?category=collares&color=dorado&q=perla&sort=price_asc"
    );
  });

  test("starts the search afresh when another choice changes, not when only the search does", () => {
    const { navigate } = setup({ query: makeQuery({ q: "perla" }) });
    const field = screen.getByRole("searchbox", { name: "Buscar artículos" });

    navigate(makeQuery({ q: "perla fina" }));
    expect(screen.getByRole("searchbox", { name: "Buscar artículos" })).toBe(
      field
    );

    navigate(makeQuery({ category: "aros", q: "perla fina" }));
    expect(
      screen.getByRole("searchbox", { name: "Buscar artículos" })
    ).not.toBe(field);
  });

  test("on a phone, opens its choices in a sheet, closed by either of its buttons", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    const sheet = screen.getByRole("dialog", { name: "Filtros" });
    expect(
      within(sheet).getByRole("navigation", { name: "Categorías" })
    ).toBeVisible();
    await user.click(
      within(sheet).getByRole("button", { name: "Cerrar los filtros" })
    );
    await waitFor(() => {
      expect(screen.queryByTestId("store-catalog-sheet")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Filtros" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Ver resultados",
      })
    );
    await waitFor(() => {
      expect(screen.queryByTestId("store-catalog-sheet")).toBeNull();
    });
  });

  test("following a choice in the sheet closes it; a click elsewhere in it does not", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Filtros" }));
    const sheet = screen.getByTestId("store-catalog-sheet");

    await user.click(within(sheet).getByRole("heading", { name: "Color" }));
    expect(screen.getByTestId("store-catalog-sheet")).toBe(sheet);

    await user.click(within(sheet).getByRole("link", { name: "Aros" }));

    await waitFor(() => {
      expect(screen.queryByTestId("store-catalog-sheet")).toBeNull();
    });
  });

  test("the sheet's button counts the chosen choices", () => {
    setup({ query: CHOSEN });

    expect(screen.getByRole("button", { name: "Filtros (3)" })).toBeVisible();
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
      [
        "Quitar: Collares",
        "/lr-market/products?color=dorado&q=perla&sort=price_asc",
      ],
      [
        "Quitar: Dorado",
        "/lr-market/products?category=collares&q=perla&sort=price_asc",
      ],
      [
        "Quitar: perla",
        "/lr-market/products?category=collares&color=dorado&sort=price_asc",
      ],
      ["Limpiar todo", "/lr-market/products?sort=price_asc"],
    ]);
  });

  test("leaves out chips for choices the store does not have, and shows none with nothing chosen", () => {
    setup({
      query: makeQuery({
        category: "anillos",
        filters: [
          { attribute: "color", values: ["verde"] },
          { attribute: "talle", values: ["m"] },
        ],
      }),
    });

    expect(
      screen.queryByRole("heading", { name: "Filtros elegidos" })
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeVisible();
  });

  test("lists the articles as cards: an add button for the available, sold out for the rest", () => {
    const { titles } = setup();

    expect(titles()).toEqual(["Artículo 1", "Artículo 2"]);
    const grid = within(screen.getByTestId("store-catalog-grid"));
    const [first, second] = grid.getAllByRole("article");
    const link = within(first ?? document.body).getByRole("link", {
      name: "Artículo 1",
    });
    expect(link).toHaveAttribute("href", "/lr-market/products/articulo-1");
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
    expect(
      within(first ?? document.body).getByRole("img", {
        name: "Foto del artículo 1",
      })
    ).toBeVisible();
  });

  test("in English, links the cards to the English pages and names the button in English", () => {
    setup({ locale: "en" });

    const grid = within(screen.getByTestId("store-catalog-grid"));
    expect(grid.getByRole("link", { name: "Artículo 1" })).toHaveAttribute(
      "href",
      "/en/lr-market/products/articulo-1"
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
    expect(
      within(empty).getByRole("link", { name: "Ver todo el catálogo" })
    ).toHaveAttribute("href", "/lr-market/products?sort=price_asc");
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
      storeSlug: "lr-market",
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

  test("leaves focus alone when a page arrives by scrolling", async () => {
    const { observers, titles } = setup({
      firstPage: makePage([makeItem(1)], CURSOR),
    });
    const search = screen.getByRole("searchbox", { name: "Buscar artículos" });
    search.focus();

    observers.active()?.emit(true);

    await waitFor(() => {
      expect(titles()).toEqual(["Artículo 1", "Artículo 3"]);
    });
    expect(search).toHaveFocus();
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
  });
});
