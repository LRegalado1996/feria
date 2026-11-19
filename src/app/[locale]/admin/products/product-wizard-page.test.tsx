import { ORPCError } from "@orpc/client";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AdminShellProps } from "@/app/_components/organisms/admin-shell";
import type { ProductWizardProps } from "@/app/_components/organisms/product-wizard";
import type { requireAdmin as RequireAdmin } from "@/lib/admin/access";
import { DICTIONARIES, renderWithI18n } from "@/test/i18n";

import {
  ProductWizardPage,
  type ProductWizardPageProps,
  WIZARD_VIEWPORT,
} from "./product-wizard-page";

const ARTICLE = { id: 12, slug: "anillo-de-plata" };

interface StoreText {
  description: string | null;
  locale: string;
  tagline: string | null;
}

function makeStore(
  translations: StoreText[] = [
    { description: null, locale: "es", tagline: "Bijouterie en la feria." },
    { description: null, locale: "en", tagline: "Jewellery at the fair." },
  ]
) {
  return {
    currencyCode: "UYU",
    id: 1,
    instagramUrl: null,
    name: "LR Market",
    tiktokUrl: null,
    translations,
    whatsappNumber: null,
  };
}

const mocks = vi.hoisted(() => {
  const get = vi.fn(async (_input: unknown): Promise<unknown> => null);
  const categories = vi.fn(async (): Promise<unknown> => []);
  const attributes = vi.fn(async (): Promise<unknown> => []);

  return {
    attributes,
    categories,
    get,
    query: (key: unknown[], read: () => Promise<unknown>) => ({
      queryFn: read,
      queryKey: key,
    }),
    requireAdmin: vi.fn<typeof RequireAdmin>(),
    shellProps: vi.fn<(props: Omit<AdminShellProps, "children">) => void>(),
    blobStore: vi.fn((): unknown => null),
    store: vi.fn(async (): Promise<unknown> => null),
    wizardProps: vi.fn<(props: ProductWizardProps) => void>(),
  };
});

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

// The session check has its own tests; here it answers with the login, or
// sends the visitor to the sign-in page the way the real one does.
vi.mock("@/lib/admin/access", () => ({ requireAdmin: mocks.requireAdmin }));

// Whether the deployment has its Blob store, from its token.
vi.mock("@/server/api/utils/blob-store", () => ({
  readBlobStore: mocks.blobStore,
}));

vi.mock("@/lib/seo/origin", () => ({
  siteOrigin: () => "https://lrmarket.uy",
}));

vi.mock("@/lib/orpc/server", async () => {
  const { QueryClient: Client } = await import("@tanstack/react-query");
  return {
    caller: { store: { get: mocks.store } },
    getQueryClient: () => new Client(),
    orpc: {
      attribute: {
        list: {
          queryOptions: () =>
            mocks.query(
              ["attribute", "list"],
              async () => await mocks.attributes()
            ),
        },
      },
      category: {
        list: {
          queryOptions: () =>
            mocks.query(
              ["category", "list"],
              async () => await mocks.categories()
            ),
        },
      },
      product: {
        get: {
          queryOptions: ({ input }: { input: unknown }) =>
            mocks.query(
              ["product", "get", { input }],
              async () => await mocks.get(input)
            ),
        },
      },
    },
  };
});

// The shell has its own tests; here it records what the page handed it.
vi.mock("@/app/_components/organisms/admin-shell", () => ({
  AdminShell: ({ children, ...props }: AdminShellProps) => {
    mocks.shellProps(props);
    return <div data-testid="admin-shell">{children}</div>;
  },
}));

// The wizard has its own tests; here it records its props and shows what it
// finds in the cache the page hydrated.
vi.mock("@/app/_components/organisms/product-wizard", () => ({
  ProductWizard: (props: ProductWizardProps) => {
    mocks.wizardProps(props);
    const cache = useQueryClient();
    return (
      <div data-testid="product-wizard">
        {JSON.stringify([
          cache.getQueryData(["product", "get", { input: { id: 12 } }]) ?? null,
          cache.getQueryData(["category", "list"]) ?? null,
          cache.getQueryData(["attribute", "list"]) ?? null,
        ])}
      </div>
    );
  },
}));

type Boundary = ReactElement<{
  children: ReactElement<
    ProductWizardPageProps,
    (props: ProductWizardPageProps) => Promise<ReactNode>
  >;
  fallback: ReactNode;
}>;

/**
 * The wizard page's boundary for a new article (`id` left out) or the
 * article at `id`, with a session or without one; `product.get` answers the
 * article, NOT_FOUND, or fails, and the lists answer or fail.
 */
function setup({
  article = "found",
  canUpload = true,
  id,
  listsFail = false,
  locale = "en",
  signedIn = true,
  store = makeStore(),
}: {
  article?: "fails" | "found" | "missing";
  canUpload?: boolean;
  id?: string;
  listsFail?: boolean;
  locale?: string;
  signedIn?: boolean;
  store?: ReturnType<typeof makeStore>;
} = {}) {
  mocks.requireAdmin.mockImplementation(async (returnTo) => {
    if (!signedIn) {
      redirect(`/admin/sign-in?next=${encodeURIComponent(returnTo)}`);
    }

    return await Promise.resolve({
      email: "ada@example.com",
      name: "Ada Admin",
    });
  });
  mocks.get.mockImplementation(async () => {
    if (article === "missing") {
      throw new ORPCError("NOT_FOUND", { message: "Article not found" });
    }

    if (article === "fails") {
      throw new Error("database unavailable");
    }

    return await Promise.resolve(ARTICLE);
  });
  const list = async (rows: unknown) => {
    if (listsFail) {
      throw new Error("database unavailable");
    }

    return await Promise.resolve(rows);
  };
  mocks.categories.mockImplementation(async () => await list([{ id: 4 }]));
  mocks.attributes.mockImplementation(async () => await list([{ id: 5 }]));
  mocks.store.mockResolvedValue(store);
  mocks.blobStore.mockReturnValue(
    canUpload
      ? { host: "store.public.blob.vercel-storage.com", namespace: "local" }
      : null
  );
  const page: Boundary = ProductWizardPage({
    params: Promise.resolve(id === undefined ? { locale } : { id, locale }),
  });
  const inner = page.props.children;

  return {
    fallback: page.props.fallback,
    resolve: async () => await inner.type(inner.props),
    show: async () => {
      render(await inner.type(inner.props), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={new QueryClient()}>
            {children}
          </QueryClientProvider>
        ),
      });
    },
  };
}

describe("ProductWizardPage", () => {
  test("waits behind the shell's skeleton, without reading the params", () => {
    const { fallback } = setup();

    renderWithI18n(<div>{fallback}</div>);

    expect(screen.getByTestId("admin-shell-skeleton")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(mocks.requireAdmin).not.toHaveBeenCalled();
  });

  test.each([
    ["en", undefined, "/en/admin/products/new"],
    ["es", undefined, "/admin/products/new"],
    ["en", "12", "/en/admin/products/12"],
    ["es", "12", "/admin/products/12"],
  ] as const)(
    "in %s, for the article %s, checks the session coming back to %s",
    async (locale, id, returnTo) => {
      const { show } = setup({ id, locale });

      await show();

      expect(mocks.requireAdmin).toHaveBeenCalledExactlyOnceWith(
        returnTo,
        locale
      );
    }
  );

  test.each(["0", "007", "new2", "4.2", "2147483648"])(
    "answers 404 for %j, which no article's id can be, before any session check or query",
    async (id) => {
      const { resolve } = setup({ id });

      await expect(resolve()).rejects.toMatchObject({
        digest: "NEXT_HTTP_ERROR_FALLBACK;404",
      });
      expect(mocks.requireAdmin).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
    }
  );

  test("sends a visitor without a session to the sign-in, reading nothing", async () => {
    const { resolve } = setup({ id: "12", locale: "es", signedIn: false });

    await expect(resolve()).rejects.toMatchObject({
      digest:
        "NEXT_REDIRECT;replace;/admin/sign-in?next=%2Fadmin%2Fproducts%2F12;307;",
    });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  test("answers 404 for an article the store does not have", async () => {
    const { resolve } = setup({ article: "missing", id: "12" });

    await expect(resolve()).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith({ id: 12 });
    expect(mocks.shellProps).not.toHaveBeenCalled();
  });

  test("still opens the wizard when the article's read fails otherwise, leaving the read to it", async () => {
    const { show } = setup({ article: "fails", id: "12" });

    await show();

    expect(mocks.wizardProps).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 12 })
    );
    expect(screen.getByTestId("product-wizard")).toHaveTextContent(
      '[null,[{"id":4}],[{"id":5}]]'
    );
  });

  test.each(["en", "es"] as const)(
    "in %s, opens an article in the articles section with it, the categories and the filters already fetched",
    async (locale) => {
      const { show } = setup({ id: "12", locale });

      await show();

      expect(mocks.shellProps).toHaveBeenCalledExactlyOnceWith({
        dictionary: DICTIONARIES[locale].admin,
        locale,
        login: { email: "ada@example.com", name: "Ada Admin" },
        section: "products",
      });
      expect(mocks.wizardProps).toHaveBeenCalledExactlyOnceWith({
        articleId: 12,
        canUpload: true,
        host: "lrmarket.uy",
        store: {
          currencyCode: "UYU",
          name: "LR Market",
          taglines: {
            en: "Jewellery at the fair.",
            es: "Bijouterie en la feria.",
          },
        },
      });
      expect(screen.getByTestId("product-wizard")).toHaveTextContent(
        `[${JSON.stringify(ARTICLE)},[{"id":4}],[{"id":5}]]`
      );
    }
  );

  test("tells the wizard a deployment without its Blob store cannot take photos", async () => {
    const { show } = setup({ canUpload: false });

    await show();

    expect(mocks.wizardProps).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: null, canUpload: false })
    );
  });

  test("opens a new article reading no article", async () => {
    const { show } = setup();

    await show();

    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.wizardProps).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: null })
    );
  });

  test.each([
    [
      "the Spanish tagline for both when only Spanish has one",
      [{ description: null, locale: "es", tagline: "Bijouterie." }],
      { en: "Bijouterie.", es: "Bijouterie." },
    ],
    [
      "none when the store has no tagline",
      [{ description: null, locale: "es", tagline: null }],
      { en: undefined, es: undefined },
    ],
  ])("hands the wizard %s", async (_case, translations, taglines) => {
    const { show } = setup({ store: makeStore(translations) });

    await show();

    expect(mocks.wizardProps).toHaveBeenCalledWith(
      expect.objectContaining({
        store: expect.objectContaining({ taglines }),
      })
    );
  });

  test("still opens the wizard when the lists fail, leaving them to it", async () => {
    const { show } = setup({ listsFail: true });

    await show();

    expect(screen.getByTestId("product-wizard")).toHaveTextContent(
      "[null,null,null]"
    );
  });
});

describe("WIZARD_VIEWPORT", () => {
  test("lets the keyboard shrink the page instead of covering it, and keeps zoom", () => {
    expect(WIZARD_VIEWPORT).toEqual({
      initialScale: 1,
      interactiveWidget: "resizes-content",
      width: "device-width",
    });
  });
});
