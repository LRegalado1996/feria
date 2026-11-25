import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StoreCatalogProps } from "@/app/_components/organisms/store-catalog";
import type { CatalogCover } from "@/lib/catalog/cover";
import type { RawSearchParams } from "@/lib/catalog/query";
import type { Locale } from "@/lib/i18n/config";
import type { CategoryPage, PublicCategory } from "@/server/services/catalog";
import type { PublicStore } from "@/server/services/store";

import { CatalogPageView, catalogMetadata } from "./catalog-page";

const mocks = vi.hoisted(() => ({
  catalogProps: vi.fn<(props: StoreCatalogProps) => void>(),
  filters: vi.fn(async (_input: unknown): Promise<unknown> => []),
  frameProps: vi.fn<(props: Record<string, unknown>) => void>(),
  products: vi.fn(async (_input: unknown): Promise<unknown> => null),
  readAllArticlesCover: vi.fn(),
  readCategories: vi.fn(),
  readCategoryPage: vi.fn(),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
  shellOf: vi.fn(
    async (_store: unknown, _locale: string, _categories?: unknown) => ({
      announcement: Promise.resolve(null),
      categories: [],
    })
  ),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The cached reads have their own tests; here they answer what the test says.
vi.mock("@/server/cache/store", () => ({ readStore: mocks.readStore }));
vi.mock("@/server/cache/catalog", () => ({
  readAllArticlesCover: mocks.readAllArticlesCover,
  readCategoryPage: mocks.readCategoryPage,
}));

// The procedures have their own tests; here they are spied on.
vi.mock("@/lib/orpc/server", () => ({
  caller: {
    catalog: {
      categories: mocks.readCategories,
      filters: mocks.filters,
      products: mocks.products,
    },
  },
}));

// The frame's parts have their own tests (`store-shell.test.ts`).
vi.mock("./store-shell", () => ({ shellOf: mocks.shellOf }));

vi.mock("@/app/_components/organisms/store-frame", () => ({
  StoreFrame: ({
    children,
    ...props
  }: Record<string, unknown> & { children: ReactNode }) => {
    mocks.frameProps(props);
    return <div data-testid="store-frame">{children}</div>;
  },
}));

vi.mock("@/app/_components/organisms/store-catalog", () => ({
  StoreCatalog: (props: StoreCatalogProps) => {
    mocks.catalogProps(props);
    return <h1>{props.heading}</h1>;
  },
}));

vi.mock("./store-page-footer", () => ({
  StorePageFooter: ({
    categories,
    locale,
  }: {
    categories?: readonly { slug: string }[];
    locale: Locale;
  }) => (
    <footer data-testid="footer">
      {`${locale} ${categories?.map((entry) => entry.slug).join(",") ?? "cached"}`}
    </footer>
  ),
}));

const ORIGIN = "http://localhost:3000";
const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

function makeStore(): PublicStore {
  return {
    currencyCode: "UYU",
    id: 7,
    instagramUrl: null,
    name: "LR Market",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
  };
}

function makeCategory(
  id: number,
  name: string,
  slug: string,
  parent: { id: number; slug: string } | null = null
): PublicCategory {
  return {
    id,
    lang: "es",
    name,
    parentId: parent?.id ?? null,
    path: parent ? `/${parent.slug}/${slug}` : `/${slug}`,
    position: id,
    showInHeader: true,
    slug,
  };
}

// LR Market's catalog (FER-043): Bijouterie holding two, then the bubbles.
const CATEGORIES = [
  makeCategory(6, "Bijouterie", "bijouterie"),
  makeCategory(2, "Cadenas", "cadenas", { id: 6, slug: "bijouterie" }),
  makeCategory(3, "Anillos", "anillos", { id: 6, slug: "bijouterie" }),
  makeCategory(1, "Burbujeros", "burbujeros"),
];

const COVER: CatalogCover = {
  alt: "Anillo sello dorado",
  computer: { height: 800, url: "/seed/ring-2.jpg", width: 1200 },
  phone: null,
};

const BIJOUTERIE_PAGE: CategoryPage = {
  children: [
    {
      lang: "es",
      name: "Cadenas",
      path: "/bijouterie/cadenas",
      slug: "cadenas",
    },
    {
      lang: "es",
      name: "Anillos",
      path: "/bijouterie/anillos",
      slug: "anillos",
    },
  ],
  cover: null,
  id: 6,
  isShown: true,
  lang: "es",
  name: "Bijouterie",
  parent: null,
  path: "/bijouterie",
  seoDescription: null,
  seoTitle: null,
  slug: "bijouterie",
};

const RINGS_PAGE: CategoryPage = {
  children: [],
  cover: COVER,
  id: 3,
  isShown: true,
  lang: "es",
  name: "Anillos",
  parent: {
    lang: "es",
    name: "Bijouterie",
    path: "/bijouterie",
    slug: "bijouterie",
  },
  path: "/bijouterie/anillos",
  seoDescription: "Anillos de la feria, de plata y dorados.",
  seoTitle: null,
  slug: "anillos",
};

const PAGES: Record<string, CategoryPage> = {
  anillos: RINGS_PAGE,
  bijouterie: BIJOUTERIE_PAGE,
};

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

const FIRST_PAGE = {
  items: [
    { slug: "anillo-sello", title: "Anillo sello" },
    { slug: "anillo-flor", title: "Anillo flor" },
  ],
  nextCursor: null,
};

function setup({
  category,
  group,
  locale = "es",
  pages = PAGES,
  search = {},
  store = makeStore(),
}: {
  category?: string;
  group?: string;
  locale?: string;
  pages?: Record<string, CategoryPage>;
  search?: RawSearchParams | Promise<RawSearchParams>;
  store?: PublicStore | null;
} = {}) {
  mocks.readStore.mockResolvedValue(store);
  mocks.readCategories.mockResolvedValue(CATEGORIES);
  mocks.readCategoryPage.mockImplementation(
    async (_store: unknown, slug: string) =>
      await Promise.resolve(pages[slug] ?? null)
  );
  mocks.readAllArticlesCover.mockResolvedValue(null);
  mocks.filters.mockResolvedValue(FILTERS);
  mocks.products.mockResolvedValue(FIRST_PAGE);
  const props = () => ({
    params: Promise.resolve({ category, group, locale }),
    searchParams: Promise.resolve(search),
  });

  return {
    /** What the page handed the catalog, once rendered. */
    catalog: () => mocks.catalogProps.mock.calls.at(-1)?.[0],
    metadata: async () => await catalogMetadata(props()),
    /** The page rendered, and its structured data read back. */
    show: async () => {
      render(await CatalogPageView(props()));
      const script = document.querySelector(
        'script[type="application/ld+json"]'
      );

      return JSON.parse(script?.textContent ?? "null") as unknown[];
    },
  };
}

describe("a catalog page's address", () => {
  test("is all articles without a slug: its cover is the store's, its trail home and itself", async () => {
    const { catalog, show } = setup();
    mocks.readAllArticlesCover.mockResolvedValue(COVER);

    const [collection] = await show();

    expect(mocks.readCategoryPage).not.toHaveBeenCalled();
    expect(mocks.readAllArticlesCover).toHaveBeenCalledExactlyOnceWith(
      makeStore(),
      "es",
      "Catálogo"
    );
    expect(mocks.products).toHaveBeenCalledExactlyOnceWith({
      category: undefined,
      filters: [],
      locale: "es",
      q: undefined,
      sort: "position",
    });
    expect(catalog()).toMatchObject({
      breadcrumb: {
        items: [
          { href: "/", name: "Home" },
          { lang: undefined, name: "Catálogo" },
        ],
        label: "Ruta",
      },
      cover: COVER,
      heading: "Catálogo",
      query: { category: null },
      startCursor: null,
    });
    // The page's words feed its structured data and its metadata, and are
    // no longer shown on it (FER-044).
    expect(catalog()).not.toHaveProperty("description");
    expect(collection).toMatchObject({
      description: "Todos los artículos de LR Market.",
    });
    // The filter panel lists a group's categories right after it.
    expect(
      catalog()?.categories.map((entry) => [
        entry.slug,
        entry.depth,
        entry.path,
      ])
    ).toEqual([
      ["bijouterie", 0, "/bijouterie"],
      ["cadenas", 1, "/bijouterie/cadenas"],
      ["anillos", 1, "/bijouterie/anillos"],
      ["burbujeros", 0, "/burbujeros"],
    ]);
    expect(mocks.frameProps).toHaveBeenCalledWith(
      expect.objectContaining({ currentPath: "/productos", locale: "es" })
    );
    // The categories read as of now, not the cached list: the header and the
    // footer list the same ones as the filter panel.
    expect(mocks.readCategories).toHaveBeenCalledExactlyOnceWith({
      locale: "es",
    });
    expect(mocks.shellOf).toHaveBeenCalledExactlyOnceWith(
      makeStore(),
      "es",
      CATEGORIES
    );
    expect(screen.getByTestId("footer")).toHaveTextContent(
      "es bijouterie,cadenas,anillos,burbujeros"
    );
  });

  test("is a group's page at its slug, listing every article in it, its words made from its categories", async () => {
    const { catalog, show } = setup({ group: "bijouterie" });

    const [collection] = await show();

    expect(mocks.readCategoryPage).toHaveBeenCalledExactlyOnceWith(
      makeStore(),
      "bijouterie",
      "es"
    );
    expect(collection).toMatchObject({
      description:
        "Comprá Bijouterie en LR Market: Cadenas y Anillos. Mirá los precios y hacé tu pedido online.",
    });
    expect(mocks.products).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ category: "bijouterie" })
    );
    expect(catalog()).toMatchObject({
      breadcrumb: {
        items: [
          { href: "/", name: "Home" },
          { lang: "es", name: "Bijouterie" },
        ],
      },
      cover: null,
      heading: "Bijouterie",
      query: { category: { path: "/bijouterie", slug: "bijouterie" } },
    });
    expect(mocks.readAllArticlesCover).not.toHaveBeenCalled();
    expect(mocks.frameProps).toHaveBeenCalledWith(
      expect.objectContaining({ currentPath: "/bijouterie" })
    );
  });

  test("is a category's page under its group, its trail through the group, its own words and cover", async () => {
    const { catalog, show } = setup({
      category: "anillos",
      group: "bijouterie",
      locale: "en",
    });

    const [collection] = await show();

    expect(mocks.readCategoryPage).toHaveBeenCalledExactlyOnceWith(
      makeStore(),
      "anillos",
      "en"
    );
    expect(collection).toMatchObject({
      description: "Anillos de la feria, de plata y dorados.",
    });
    expect(catalog()).toMatchObject({
      breadcrumb: {
        items: [
          { href: "/en", name: "Home" },
          { href: "/en/bijouterie", lang: "es", name: "Bijouterie" },
          { lang: "es", name: "Anillos" },
        ],
        label: "Breadcrumb",
      },
      cover: COVER,
    });
  });

  test("words a category in no group from its name and the store's", async () => {
    const bubbles: CategoryPage = {
      ...RINGS_PAGE,
      name: "Burbujeros",
      parent: null,
      path: "/burbujeros",
      seoDescription: null,
      slug: "burbujeros",
    };
    const { metadata, show } = setup({
      group: "burbujeros",
      locale: "en",
      pages: { burbujeros: bubbles },
    });

    const [collection] = await show();

    expect(collection).toMatchObject({
      description:
        "Shop Burbujeros at LR Market. See the prices and order online.",
    });
    expect((await metadata()).description).toBe(
      "Shop Burbujeros at LR Market. See the prices and order online."
    );
  });

  test.each([
    ["an unknown slug", { group: "relojes" }, makeStore()],
    [
      "an unknown category under a group",
      { category: "relojes", group: "bijouterie" },
      makeStore(),
    ],
    ["any page before the store's row exists", { group: "bijouterie" }, null],
  ])(
    "answers %s with a real 404, before any article is read",
    async (_case, address, store) => {
      const { show } = setup({ ...address, store });

      await expect(show()).rejects.toMatchObject(NOT_FOUND);
      expect(mocks.products).not.toHaveBeenCalled();
    }
  );

  test.each([
    [
      "without its group",
      { group: "anillos" },
      "es",
      "/bijouterie/anillos?color=dorado",
    ],
    [
      "under a group it is not in",
      { category: "anillos", group: "burbujeros" },
      "es",
      "/bijouterie/anillos?color=dorado",
    ],
    [
      "a group asked as a group's category",
      { category: "bijouterie", group: "bijouterie" },
      "en",
      "/en/bijouterie?color=dorado",
    ],
  ])(
    "sends a category asked %s to its page for good, its query string kept",
    async (_case, address, locale, target) => {
      const { show } = setup({
        ...address,
        locale,
        search: { color: "dorado" },
      });

      await expect(show()).rejects.toMatchObject({
        digest: `NEXT_REDIRECT;replace;${target};308;`,
      });
      expect(mocks.products).not.toHaveBeenCalled();
    }
  );

  test("reads the store only once the query string is there, so the build reads no database", async () => {
    let arrive: (search: RawSearchParams) => void = () => undefined;
    const search = new Promise<RawSearchParams>((resolve) => {
      arrive = resolve;
    });
    const { show } = setup({ search });

    const shown = show();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(mocks.readStore).not.toHaveBeenCalled();
    arrive({});
    await shown;
    expect(mocks.readStore).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("a catalog page's structured data", () => {
  test("is a CollectionPage of its first articles in order, with its trail, and the trail alone", async () => {
    const { show } = setup({ category: "anillos", group: "bijouterie" });

    const data = await show();

    const trail = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: `${ORIGIN}/`,
          name: "Home",
          position: 1,
        },
        {
          "@type": "ListItem",
          item: `${ORIGIN}/bijouterie`,
          name: "Bijouterie",
          position: 2,
        },
        {
          "@type": "ListItem",
          item: `${ORIGIN}/bijouterie/anillos`,
          name: "Anillos",
          position: 3,
        },
      ],
    };
    expect(data).toEqual([
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        breadcrumb: trail,
        description: "Anillos de la feria, de plata y dorados.",
        inLanguage: "es",
        mainEntity: {
          "@type": "ItemList",
          itemListElement: [
            {
              "@type": "ListItem",
              name: "Anillo sello",
              position: 1,
              url: `${ORIGIN}/productos/anillo-sello`,
            },
            {
              "@type": "ListItem",
              name: "Anillo flor",
              position: 2,
              url: `${ORIGIN}/productos/anillo-flor`,
            },
          ],
          numberOfItems: 2,
        },
        name: "Anillos",
        url: `${ORIGIN}/bijouterie/anillos`,
      },
      trail,
    ]);
  });
});

describe("catalogMetadata", () => {
  test("titles a category from its name and the store's, its canonical and hreflang under the group, its cover the share card", async () => {
    const { metadata } = setup({
      category: "anillos",
      group: "bijouterie",
      search: { sort: "price_asc" },
    });

    await expect(metadata()).resolves.toEqual({
      alternates: {
        canonical: "/bijouterie/anillos",
        languages: {
          en: "/en/bijouterie/anillos",
          es: "/bijouterie/anillos",
          "x-default": "/bijouterie/anillos",
        },
      },
      description: "Anillos de la feria, de plata y dorados.",
      openGraph: {
        description: "Anillos de la feria, de plata y dorados.",
        images: [
          {
            alt: "Anillo sello dorado",
            height: 800,
            url: `${ORIGIN}/seed/ring-2.jpg`,
            width: 1200,
          },
        ],
        siteName: "LR Market",
        title: "Anillos",
        type: "website",
      },
      title: { absolute: "Anillos · LR Market" },
    });
  });

  test("takes the admin's own title whole, and shares the brand's card without a cover", async () => {
    const { metadata } = setup({
      group: "bijouterie",
      pages: {
        bijouterie: { ...BIJOUTERIE_PAGE, seoTitle: "Bijouterie de la feria" },
      },
    });

    const result = await metadata();

    expect(result.title).toEqual({ absolute: "Bijouterie de la feria" });
    expect(result.openGraph).toEqual({
      description:
        "Comprá Bijouterie en LR Market: Cadenas y Anillos. Mirá los precios y hacé tu pedido online.",
      images: [
        {
          alt: "LR Market",
          height: 630,
          type: "image/png",
          url: "/es/opengraph-image",
          width: 1200,
        },
      ],
      siteName: "LR Market",
      title: "Bijouterie de la feria",
      type: "website",
    });
  });

  test("names a filtered page after its selection, keeps the filter in its canonical, and leaves a search out of the index", async () => {
    const { metadata } = setup({
      category: "anillos",
      group: "bijouterie",
      search: { color: "dorado", q: "sello" },
    });

    await expect(metadata()).resolves.toMatchObject({
      alternates: { canonical: "/bijouterie/anillos?color=dorado" },
      description: "Anillos · Dorado · «sello», en LR Market.",
      // The share card carries no search, in its words either.
      openGraph: {
        description: "Anillos · Dorado, en LR Market.",
        title: "Anillos · Dorado",
      },
      robots: { follow: true, index: false },
      title: { absolute: "Anillos · Dorado · «sello» · LR Market" },
    });
  });

  test("shares a page searched without a filter with the page's own words", async () => {
    const { metadata } = setup({
      category: "anillos",
      group: "bijouterie",
      search: { q: "sello" },
    });

    await expect(metadata()).resolves.toMatchObject({
      description: "Anillos · «sello», en LR Market.",
      openGraph: {
        description: "Anillos de la feria, de plata y dorados.",
        title: "Anillos",
      },
    });
  });

  test("answers an unknown page with a 404 here too", async () => {
    const { metadata } = setup({ group: "relojes" });

    await expect(metadata()).rejects.toMatchObject(NOT_FOUND);
  });

  test("keeps a later page of a list out of the index, its links followed, its canonical the list's first (FER-044)", async () => {
    const { metadata } = setup({
      category: "anillos",
      group: "bijouterie",
      search: { cursor: "12.48", sort: "price_asc" },
    });

    await expect(metadata()).resolves.toMatchObject({
      alternates: { canonical: "/bijouterie/anillos" },
      robots: { follow: true, index: false },
    });
  });

  test("indexes a list's first page", async () => {
    const { metadata } = setup({ category: "anillos", group: "bijouterie" });

    expect(await metadata()).not.toHaveProperty("robots");
  });

  test("keeps a category the storefront does not list (no published article) out of the index, its page still answering (FER-079)", async () => {
    const { catalog, metadata, show } = setup({
      category: "anillos",
      group: "bijouterie",
      pages: { ...PAGES, anillos: { ...RINGS_PAGE, isShown: false } },
    });

    await expect(metadata()).resolves.toMatchObject({
      alternates: { canonical: "/bijouterie/anillos" },
      robots: { follow: true, index: false },
      title: { absolute: "Anillos · LR Market" },
    });
    await show();
    expect(catalog()).toMatchObject({ heading: "Anillos" });
  });
});

describe("a catalog page's later page (FER-044)", () => {
  test.each([
    [
      "the store's order",
      { cursor: "12.48" },
      { id: 48, position: 12, sort: "position" },
    ],
    [
      "a price order",
      { cursor: "69000.48", sort: "price_desc" },
      { id: 48, priceAmount: 69_000, sort: "price_desc" },
    ],
  ] as const)(
    "with %s, reads the articles after the address's cursor and tells the catalog where it started",
    async (_case, search, cursor) => {
      const { catalog, show } = setup({ search });

      await show();

      expect(mocks.products).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ cursor })
      );
      expect(catalog()?.startCursor).toEqual(cursor);
    }
  );

  test.each([
    ["a cursor that does not read", { cursor: "doce" }],
    ["a cursor repeated", { cursor: ["12.48", "13.49"] }],
  ])("reads %s as the first page", async (_case, search) => {
    const { catalog, show } = setup({ search });

    await show();

    expect(mocks.products).toHaveBeenCalledExactlyOnceWith(
      expect.not.objectContaining({ cursor: expect.anything() })
    );
    expect(catalog()?.startCursor).toBeNull();
  });
});
