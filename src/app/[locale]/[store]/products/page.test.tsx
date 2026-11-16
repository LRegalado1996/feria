import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StoreCatalogProps } from "@/app/_components/organisms/store-catalog";
import type { RawSearchParams } from "@/lib/catalog/query";
import type { PublicStore } from "@/server/services/store";
import { renderWithI18n } from "@/test/i18n";

import CatalogPage, { generateMetadata, instant } from "./page";

const { catalogProps, categories, filters, getStoreForPath, products } =
  vi.hoisted(() => ({
    catalogProps: vi.fn<(props: StoreCatalogProps) => void>(),
    categories: vi.fn(async (_input: unknown): Promise<unknown> => []),
    filters: vi.fn(async (_input: unknown): Promise<unknown> => []),
    getStoreForPath: vi.fn<(segment: string) => Promise<PublicStore | null>>(),
    products: vi.fn(async (_input: unknown): Promise<unknown> => null),
  }));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached read has its own tests; here it answers by the segment it got.
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));

// The procedures have their own tests; here they answer and are spied on
// for what the page asked.
vi.mock("@/lib/orpc/server", () => ({
  caller: { catalog: { categories, filters, products } },
}));

// The catalog has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/store-catalog", () => ({
  StoreCatalog: (props: StoreCatalogProps) => {
    catalogProps(props);
    return <div data-testid="store-catalog">{props.heading}</div>;
  },
}));

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    colorAccent: "#ff8a3d",
    colorBackground: "#fff4e6",
    colorContrast: "#3d1f47",
    colorForeground: "#2b1a12",
    colorSurface: "#fffaf5",
    currencyCode: "UYU",
    id: 7,
    instagramUrl: null,
    logoUrl: null,
    name: "LR Market",
    slug: "lr-market",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
    ...overrides,
  };
}

const CATEGORIES = [
  { lang: "es", name: "Collares", slug: "collares" },
  { lang: "es", name: "Aros", slug: "aros" },
];

const FILTERS = [
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
    ],
  },
];

const FIRST_PAGE = { items: [], nextCursor: null };

async function makeParams(locale: string, store = "lr-market") {
  return await Promise.resolve({ locale, store });
}

async function makeSearch(search: RawSearchParams) {
  return await Promise.resolve(search);
}

type Boundary = ReactElement<{
  children: ReactElement<
    { params: unknown; searchParams: unknown },
    (props: { params: unknown; searchParams: unknown }) => Promise<ReactNode>
  >;
  fallback: ReactElement;
}>;

/** The store's reads answer for `lr-market` only. */
function answer() {
  getStoreForPath.mockImplementation(
    async (segment) =>
      await Promise.resolve(segment === "lr-market" ? makeStore() : null)
  );
  categories.mockResolvedValue(CATEGORIES);
  filters.mockResolvedValue(FILTERS);
  products.mockResolvedValue(FIRST_PAGE);
}

function setup({
  locale = "es",
  search = {},
  store = "lr-market",
}: { locale?: string; search?: RawSearchParams; store?: string } = {}) {
  answer();
  const page: Boundary = CatalogPage({
    params: makeParams(locale, store),
    searchParams: makeSearch(search),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    metadata: async () =>
      await generateMetadata({
        params: makeParams(locale, store),
        searchParams: makeSearch(search),
      }),
    resolve: async () => await inner.type(inner.props),
    show: async () => {
      render(await inner.type(inner.props));
    },
  };
}

describe("CatalogPage", () => {
  test("opts out of the instant-navigation check: it waits for its selection by design", () => {
    expect(instant).toBe(false);
  });

  test("waits behind the catalog's skeleton", () => {
    const { fallback } = setup();

    renderWithI18n(fallback, { locale: "es" });

    expect(screen.getByTestId("store-catalog-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(getStoreForPath).not.toHaveBeenCalled();
  });

  test("answers 404 for an address that is not a store, asking nothing", async () => {
    const { resolve } = setup({ store: "nobody" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("nobody");
    expect(products).not.toHaveBeenCalled();
  });

  test("renders the first page of the selection the address asks for", async () => {
    const { show } = setup({
      locale: "en",
      search: {
        category: "collares",
        color: "dorado",
        q: "perla",
        sort: "price_desc",
      },
    });

    await show();

    expect(categories).toHaveBeenCalledExactlyOnceWith({
      locale: "en",
      storeSlug: "lr-market",
    });
    expect(filters).toHaveBeenCalledExactlyOnceWith({
      locale: "en",
      storeSlug: "lr-market",
    });
    expect(products).toHaveBeenCalledExactlyOnceWith({
      category: "collares",
      filters: [{ attribute: "color", values: ["dorado"] }],
      locale: "en",
      q: "perla",
      sort: "price_desc",
      storeSlug: "lr-market",
    });
    expect(catalogProps).toHaveBeenCalledExactlyOnceWith({
      categories: CATEGORIES,
      filters: FILTERS,
      firstPage: FIRST_PAGE,
      heading: "Collares · Dorado · “perla”",
      query: {
        category: "collares",
        filters: [{ attribute: "color", values: ["dorado"] }],
        q: "perla",
        sort: "price_desc",
      },
      storeSlug: "lr-market",
    });
    expect(screen.getByTestId("store-catalog").parentElement?.tagName).toBe(
      "MAIN"
    );
  });

  test("drops choices the store does not have before asking for articles", async () => {
    const { show } = setup({
      search: { category: "anillos", color: "verde,dorado", talle: "m" },
    });

    await show();

    expect(products).toHaveBeenCalledExactlyOnceWith({
      category: undefined,
      filters: [{ attribute: "color", values: ["dorado"] }],
      locale: "es",
      q: undefined,
      sort: "newest",
      storeSlug: "lr-market",
    });
    expect(catalogProps).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        heading: "Dorado",
        query: {
          category: null,
          filters: [{ attribute: "color", values: ["dorado"] }],
          q: null,
          sort: "newest",
        },
      })
    );
  });

  test.each([
    ["es", "Catálogo"],
    ["en", "Catalog"],
  ] as const)("in %s, heads the whole catalog %j", async (locale, heading) => {
    const { show } = setup({ locale });

    await show();

    expect(screen.getByTestId("store-catalog")).toHaveTextContent(
      new RegExp(`^${heading}$`, "u")
    );
  });
});

describe("generateMetadata", () => {
  test("adds nothing for an address that is not a store", async () => {
    const { metadata } = setup({ store: "nobody" });

    await expect(metadata()).resolves.toEqual({});
    expect(categories).not.toHaveBeenCalled();
  });

  test.each([
    [
      "es",
      "Catálogo",
      "Todos los artículos de LR Market.",
      "/lr-market/products",
    ],
    ["en", "Catalog", "Every article of LR Market.", "/en/lr-market/products"],
  ] as const)(
    "in %s, titles the whole catalog %j",
    async (locale, title, description, canonical) => {
      const { metadata } = setup({ locale });

      await expect(metadata()).resolves.toEqual({
        alternates: {
          canonical,
          languages: {
            en: "/en/lr-market/products",
            es: "/lr-market/products",
            "x-default": "/lr-market/products",
          },
        },
        description,
        openGraph: { description, title, type: "website" },
        title,
      });
    }
  );

  test("titles a selection by its name, and keeps it but not the search or the sort in its addresses", async () => {
    const { metadata } = setup({
      search: {
        category: "collares",
        color: "dorado,verde",
        sort: "price_asc",
      },
    });

    await expect(metadata()).resolves.toEqual({
      alternates: {
        canonical: "/lr-market/products?category=collares&color=dorado",
        languages: {
          en: "/en/lr-market/products?category=collares&color=dorado",
          es: "/lr-market/products?category=collares&color=dorado",
          "x-default": "/lr-market/products?category=collares&color=dorado",
        },
      },
      description: "Collares · Dorado, en LR Market.",
      openGraph: {
        description: "Collares · Dorado, en LR Market.",
        title: "Collares · Dorado",
        type: "website",
      },
      title: "Collares · Dorado",
    });
  });

  test("names the search in the title only: the share card leaves it out, and search engines skip the page", async () => {
    const { metadata } = setup({
      search: { category: "collares", q: "perla" },
    });

    await expect(metadata()).resolves.toEqual({
      alternates: {
        canonical: "/lr-market/products?category=collares",
        languages: {
          en: "/en/lr-market/products?category=collares",
          es: "/lr-market/products?category=collares",
          "x-default": "/lr-market/products?category=collares",
        },
      },
      description: "Collares · «perla», en LR Market.",
      openGraph: {
        description: "Collares, en LR Market.",
        title: "Collares",
        type: "website",
      },
      robots: { follow: true, index: false },
      title: "Collares · «perla»",
    });
  });

  test.each([
    [
      "es",
      "«perla»",
      "«perla», en LR Market.",
      "Catálogo",
      "Todos los artículos de LR Market.",
    ],
    [
      "en",
      "“perla”",
      "“perla”, at LR Market.",
      "Catalog",
      "Every article of LR Market.",
    ],
  ] as const)(
    "in %s, a search alone titles the page %j, and the share card is the plain catalog's",
    async (locale, title, description, sharedTitle, sharedDescription) => {
      const { metadata } = setup({ locale, search: { q: "perla" } });

      await expect(metadata()).resolves.toMatchObject({
        description,
        openGraph: {
          description: sharedDescription,
          title: sharedTitle,
          type: "website",
        },
        robots: { follow: true, index: false },
        title,
      });
    }
  );
});
