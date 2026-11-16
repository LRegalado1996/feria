import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StoreCatalogProps } from "@/app/_components/organisms/store-catalog";
import type { RawSearchParams } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { renderWithI18n } from "@/test/i18n";

import CatalogPage, { generateMetadata, instant } from "./page";

const { catalogProps, categories, filters, products, readStore } = vi.hoisted(
  () => ({
    catalogProps: vi.fn<(props: StoreCatalogProps) => void>(),
    categories: vi.fn(async (_input: unknown): Promise<unknown> => []),
    filters: vi.fn(async (_input: unknown): Promise<unknown> => []),
    products: vi.fn(async (_input: unknown): Promise<unknown> => null),
    readStore: vi.fn<() => Promise<PublicStore | null>>(),
  })
);

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached read has its own tests; here it answers what the test says.
vi.mock("@/server/cache/store", () => ({ readStore }));

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

// The footer has its own tests; here it only shows whose it is.
vi.mock("../store-page-footer", () => ({
  StorePageFooter: ({
    locale,
    store,
  }: {
    locale: Locale;
    store: PublicStore;
  }) => <footer data-testid="footer">{`${store.name} ${locale}`}</footer>,
}));

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    currencyCode: "UYU",
    id: 7,
    instagramUrl: null,
    name: "LR Market",
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

async function makeParams(locale: string) {
  return await Promise.resolve({ locale });
}

async function makeSearch(search: RawSearchParams) {
  return await Promise.resolve(search);
}

/** A query string that arrives when the test says so. */
function heldSearch() {
  const held: { release: (search: RawSearchParams) => void } = {
    release: () => undefined,
  };
  const promise = new Promise<RawSearchParams>((resolve) => {
    held.release = resolve;
  });

  return {
    promise,
    release: (search: RawSearchParams) => {
      held.release(search);
    },
  };
}

/** Every microtask the page has queued so far has run. */
async function settle() {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

type Boundary = ReactElement<{
  children: ReactElement<
    { params: unknown; searchParams: unknown },
    (props: { params: unknown; searchParams: unknown }) => Promise<ReactNode>
  >;
  fallback: ReactElement;
}>;

function setup({
  locale = "es",
  search = {},
  store = makeStore(),
}: {
  locale?: string;
  search?: RawSearchParams;
  store?: PublicStore | null;
} = {}) {
  readStore.mockResolvedValue(store);
  categories.mockResolvedValue(CATEGORIES);
  filters.mockResolvedValue(FILTERS);
  products.mockResolvedValue(FIRST_PAGE);
  const page: Boundary = CatalogPage({
    params: makeParams(locale),
    searchParams: makeSearch(search),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    metadata: async (searchParams = makeSearch(search)) =>
      await generateMetadata({ params: makeParams(locale), searchParams }),
    resolve: async (searchParams?: Promise<RawSearchParams>) =>
      await inner.type(
        searchParams ? { ...inner.props, searchParams } : inner.props
      ),
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
    expect(readStore).not.toHaveBeenCalled();
  });

  test("reads the store only once the query string is there, so the build needs no database", async () => {
    const { resolve } = setup();
    const search = heldSearch();

    const pending = resolve(search.promise);
    await settle();

    expect(readStore).not.toHaveBeenCalled();
    search.release({});
    render(await pending);
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
  });

  test("answers the not-found page when the store's row is missing, asking nothing", async () => {
    const { resolve } = setup({ store: null });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(categories).not.toHaveBeenCalled();
    expect(products).not.toHaveBeenCalled();
  });

  test("renders the first page of the selection the address asks for, then the store's footer", async () => {
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

    expect(categories).toHaveBeenCalledExactlyOnceWith({ locale: "en" });
    expect(filters).toHaveBeenCalledExactlyOnceWith({ locale: "en" });
    expect(products).toHaveBeenCalledExactlyOnceWith({
      category: "collares",
      filters: [{ attribute: "color", values: ["dorado"] }],
      locale: "en",
      q: "perla",
      sort: "price_desc",
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
    });
    const main = screen.getByTestId("store-catalog").parentElement;
    expect(main?.tagName).toBe("MAIN");
    expect(screen.getByTestId("footer")).toHaveTextContent(/^LR Market en$/u);
    expect(main?.compareDocumentPosition(screen.getByTestId("footer"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
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
  test("adds nothing when the store's row is missing", async () => {
    const { metadata } = setup({ store: null });

    await expect(metadata()).resolves.toEqual({});
    expect(categories).not.toHaveBeenCalled();
  });

  test("reads the store only once the query string is there", async () => {
    const { metadata } = setup();
    const search = heldSearch();

    const pending = metadata(search.promise);
    await settle();

    expect(readStore).not.toHaveBeenCalled();
    search.release({});
    await pending;
    expect(readStore).toHaveBeenCalledExactlyOnceWith();
  });

  test.each([
    [
      "es",
      "Catálogo · LR Market",
      "Catálogo",
      "Todos los artículos de LR Market.",
      "/products",
    ],
    [
      "en",
      "Catalog · LR Market",
      "Catalog",
      "Every article of LR Market.",
      "/en/products",
    ],
  ] as const)(
    "in %s, titles the whole catalog %j",
    async (locale, title, shared, description, canonical) => {
      const { metadata } = setup({ locale });

      await expect(metadata()).resolves.toEqual({
        alternates: {
          canonical,
          languages: {
            en: "/en/products",
            es: "/products",
            "x-default": "/products",
          },
        },
        description,
        openGraph: { description, title: shared, type: "website" },
        title: { absolute: title },
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
        canonical: "/products?category=collares&color=dorado",
        languages: {
          en: "/en/products?category=collares&color=dorado",
          es: "/products?category=collares&color=dorado",
          "x-default": "/products?category=collares&color=dorado",
        },
      },
      description: "Collares · Dorado, en LR Market.",
      openGraph: {
        description: "Collares · Dorado, en LR Market.",
        title: "Collares · Dorado",
        type: "website",
      },
      title: { absolute: "Collares · Dorado · LR Market" },
    });
  });

  test("names the search in the title only: the share card leaves it out, and search engines skip the page", async () => {
    const { metadata } = setup({
      search: { category: "collares", q: "perla" },
    });

    await expect(metadata()).resolves.toEqual({
      alternates: {
        canonical: "/products?category=collares",
        languages: {
          en: "/en/products?category=collares",
          es: "/products?category=collares",
          "x-default": "/products?category=collares",
        },
      },
      description: "Collares · «perla», en LR Market.",
      openGraph: {
        description: "Collares, en LR Market.",
        title: "Collares",
        type: "website",
      },
      robots: { follow: true, index: false },
      title: { absolute: "Collares · «perla» · LR Market" },
    });
  });

  test.each([
    [
      "es",
      "«perla» · LR Market",
      "«perla», en LR Market.",
      "Catálogo",
      "Todos los artículos de LR Market.",
    ],
    [
      "en",
      "“perla” · LR Market",
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
        title: { absolute: title },
      });
    }
  );
});
