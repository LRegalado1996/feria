import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import type { StorePage } from "@/server/services/page-settings";
import type { PublicStore } from "@/server/services/store";

import {
  resolveStorePage,
  StorePageView,
  storePageMetadata,
} from "./store-page-view";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  frameProps: vi.fn<(props: Record<string, unknown>) => void>(),
  headers: vi.fn(async () => new Headers({ cookie: "session=1" })),
  isAdminRequest: vi.fn(async (_headers: Headers) => false),
  pageProps: vi.fn<(props: Record<string, unknown>) => void>(),
  readPageContent: vi.fn(
    async (_store: unknown, _pageId: number, _locale: string) => ({
      cover: [],
      sections: [],
    })
  ),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
  readStorePage:
    vi.fn<(store: unknown, slug: string, locale: string) => Promise<unknown>>(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect ${path}`);
  }),
  shellOf: vi.fn(async (_store: unknown, _locale: string) => ({
    announcement: Promise.resolve(null),
    categories: [],
  })),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({ connection: mocks.connection }));

vi.mock("next/headers", () => ({ headers: mocks.headers }));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

// The admin check has its own tests (`admin-request.test.ts`).
vi.mock("@/server/better-auth/admin-request", () => ({
  isAdminRequest: mocks.isAdminRequest,
}));

// The cached reads have their own tests; here they answer what the test says.
vi.mock("@/server/cache/store", () => ({ readStore: mocks.readStore }));

vi.mock("@/server/cache/page", () => ({
  readPageContent: mocks.readPageContent,
  readStorePage: mocks.readStorePage,
}));

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

// The page's look has its own tests (`organisms/store-page`).
vi.mock("@/app/_components/organisms/store-page", () => ({
  StorePage: (props: Record<string, unknown>) => {
    mocks.pageProps(props);
    return <h1>{String(props.name)}</h1>;
  },
}));

vi.mock("./store-page-footer", () => ({
  StorePageFooter: ({ locale }: { locale: Locale }) => (
    <footer data-testid="footer">{locale}</footer>
  ),
}));

const ORIGIN = "http://localhost:3000";

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

function makePage(overrides: Partial<StorePage> = {}): StorePage {
  return {
    id: 12,
    isHome: false,
    isPublished: true,
    lang: "es",
    name: "Regalos de Navidad",
    seoDescription: null,
    seoTitle: null,
    slug: "regalos",
    ...overrides,
  };
}

/** A visit to `/<slug>` in `locale`, the store and its page as given. */
function setup({
  admin = false,
  found = makePage(),
  locale = "es",
  slug = "regalos",
  store = makeStore(),
}: {
  admin?: boolean;
  found?: ReturnType<typeof makePage> | null;
  locale?: Locale;
  slug?: string;
  store?: PublicStore | null;
} = {}) {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  mocks.readStore.mockResolvedValue(store);
  mocks.readStorePage.mockResolvedValue(found);
  mocks.isAdminRequest.mockResolvedValue(admin);

  return {
    resolve: async () =>
      await resolveStorePage({
        params: Promise.resolve({ group: slug, locale }),
      }),
  };
}

describe("resolveStorePage", () => {
  test("answers the store's published page at the address, read in the visit's language", async () => {
    const { resolve } = setup({ locale: "en" });

    await expect(resolve()).resolves.toEqual({
      draft: false,
      locale: "en",
      page: makePage(),
      store: makeStore(),
    });
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.readStorePage).toHaveBeenCalledExactlyOnceWith(
      makeStore(),
      "regalos",
      "en"
    );
    // A published page asks nothing about the visitor.
    expect(mocks.isAdminRequest).not.toHaveBeenCalled();
  });

  test("answers null for an address with no page, for the catalog's turn", async () => {
    const { resolve } = setup({ found: null, slug: "bijouterie" });

    await expect(resolve()).resolves.toBeNull();
  });

  test("answers null before the store's row exists, reading no page", async () => {
    const { resolve } = setup({ store: null });

    await expect(resolve()).resolves.toBeNull();
    expect(mocks.readStorePage).not.toHaveBeenCalled();
  });

  test("a draft is not there for the public", async () => {
    const { resolve } = setup({ found: makePage({ isPublished: false }) });

    await expect(resolve()).resolves.toBeNull();
    expect(mocks.isAdminRequest).toHaveBeenCalledExactlyOnceWith(
      new Headers({ cookie: "session=1" })
    );
  });

  test("a signed-in admin previews a draft", async () => {
    const { resolve } = setup({
      admin: true,
      found: makePage({ isPublished: false }),
    });

    await expect(resolve()).resolves.toMatchObject({ draft: true });
  });

  test.each([
    ["es", "/"],
    ["en", "/en"],
  ] as const)(
    "in %s, the home's own address leads to %s, never a second copy of it",
    async (locale, home) => {
      const { resolve } = setup({
        found: makePage({ isHome: true, slug: "home" }),
        locale,
        slug: "home",
      });

      await expect(resolve()).rejects.toThrow(`redirect ${home}`);
      expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(home);
    }
  );
});

describe("storePageMetadata", () => {
  test("without texts of its own, titles the page after its name and the store, at its address in both languages", () => {
    expect(
      storePageMetadata({
        draft: false,
        locale: "en",
        page: makePage({ name: "Christmas gifts" }),
        store: makeStore(),
      })
    ).toEqual({
      alternates: {
        canonical: "/en/regalos",
        languages: {
          en: "/en/regalos",
          es: "/regalos",
          "x-default": "/regalos",
        },
      },
      description:
        "Christmas gifts at LR Market. See the prices and order online.",
      openGraph: {
        description:
          "Christmas gifts at LR Market. See the prices and order online.",
        siteName: "LR Market",
        title: "Christmas gifts · LR Market",
        type: "website",
      },
      title: { absolute: "Christmas gifts · LR Market" },
    });
  });

  test("its own title and description for search engines win, and a draft is never indexed", () => {
    const metadata = storePageMetadata({
      draft: true,
      locale: "es",
      page: makePage({
        seoDescription: "Ideas para regalar.",
        seoTitle: "Regalos 2026",
      }),
      store: makeStore(),
    });

    expect(metadata.title).toEqual({ absolute: "Regalos 2026" });
    expect(metadata.description).toBe("Ideas para regalar.");
    expect(metadata.robots).toEqual({ follow: false, index: false });
  });
});

describe("StorePageView", () => {
  test("draws the page in the store's frame with its trail from the home, then the footer", async () => {
    setup();

    render(
      await StorePageView({
        draft: false,
        locale: "es",
        page: makePage(),
        store: makeStore(),
      })
    );

    expect(screen.getByRole("main")).toHaveTextContent("Regalos de Navidad");
    expect(screen.getByTestId("footer")).toHaveTextContent("es");
    expect(mocks.frameProps).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ currentPath: "/regalos", locale: "es" })
    );
    expect(mocks.readPageContent).toHaveBeenCalledExactlyOnceWith(
      makeStore(),
      12,
      "es"
    );
    expect(mocks.pageProps).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        draft: false,
        locale: "es",
        name: "Regalos de Navidad",
        nameLang: "es",
      })
    );
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(JSON.parse(script?.textContent ?? "null")).toEqual([
      expect.objectContaining({
        "@type": "BreadcrumbList",
        itemListElement: [
          expect.objectContaining({ item: `${ORIGIN}/`, position: 1 }),
          expect.objectContaining({
            item: `${ORIGIN}/regalos`,
            name: "Regalos de Navidad",
            position: 2,
          }),
        ],
      }),
    ]);
  });
});
