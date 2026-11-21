import { render, screen } from "@testing-library/react";
import { type ReactElement, Suspense } from "react";
import { describe, expect, test, vi } from "vitest";

import type { StoreFooterProps } from "@/app/_components/organisms/store-footer";
import type { Locale } from "@/lib/i18n/config";
import type { PublicStore } from "@/server/services/store";
import { holdRequest, settle } from "@/test/connection";

import {
  StorePageFooter,
  StreamedStoreFooter,
  StreamedStoreFooterResolver,
} from "./store-page-footer";

const { connection, readCategories, readStore } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  readCategories: vi.fn(async (_store: { id: number }, locale: string) => [
    { lang: locale, name: `anillos-${locale}`, slug: "anillos" },
  ]),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({ connection }));

vi.mock("@/server/cache/store", () => ({ readStore }));

vi.mock("@/server/cache/catalog", () => ({ readCategories }));

// The footer has its own tests; here it shows what the page handed it.
vi.mock("@/app/_components/organisms/store-footer", () => ({
  StoreFooter: ({
    categories,
    className,
    copy,
    locale,
    store,
  }: StoreFooterProps) => (
    <footer className={className} data-testid="footer">
      {[
        store.name,
        copy.footer,
        copy.story.signature,
        locale,
        categories.map((category) => category.name).join(","),
      ].join(" | ")}
    </footer>
  ),
}));

const SPANISH = {
  description: "Anillos y cadenas.",
  locale: "es",
  tagline: "Joyas en la feria",
} as const;
const ENGLISH = {
  description: "Rings and chains.",
  locale: "en",
  tagline: "Jewelry at the fair",
} as const;

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    currencyCode: "UYU",
    id: 7,
    instagramUrl: "https://instagram.com/lrmarket",
    name: "LR Market",
    tiktokUrl: null,
    translations: [SPANISH, ENGLISH],
    whatsappNumber: null,
    ...overrides,
  };
}

describe("StorePageFooter", () => {
  test.each([
    ["es", "Pie de la tienda"],
    ["en", "Store footer"],
  ] as const)(
    "in %s, hands the footer the store, the page's words (Pepe's story among them) and its categories in that language",
    async (locale, footer) => {
      const store = makeStore();

      render(await StorePageFooter({ locale, store }));

      expect(screen.getByTestId("footer")).toHaveTextContent(
        `LR Market | ${footer} | Pepe | ${locale} | anillos-${locale}`
      );
      expect(readCategories).toHaveBeenLastCalledWith(store, locale);
    }
  );

  test("lists the categories a page read itself, as of now, instead of the cached ones (FER-043)", async () => {
    render(
      await StorePageFooter({
        categories: [
          {
            id: 4,
            lang: "es",
            name: "Aros",
            parentId: null,
            path: "/aros",
            slug: "aros",
          },
        ],
        locale: "es",
        store: makeStore(),
      })
    );

    expect(screen.getByTestId("footer")).toHaveTextContent(/\| Aros$/u);
    expect(readCategories).not.toHaveBeenCalled();
  });

  test("sits at the bottom of a short page", async () => {
    render(await StorePageFooter({ locale: "es", store: makeStore() }));

    expect(screen.getByTestId("footer")).toHaveClass("mt-auto");
  });
});

describe("StreamedStoreFooter", () => {
  test("puts the read behind its own boundary, with nothing in its place meanwhile", () => {
    const boundary = StreamedStoreFooter({ locale: "en" }) as ReactElement<{
      children: ReactElement<{ locale: Locale }>;
      fallback: unknown;
    }>;

    expect(boundary.type).toBe(Suspense);
    expect(boundary.props.fallback).toBeNull();
    expect(boundary.props.children.type).toBe(StreamedStoreFooterResolver);
    expect(boundary.props.children.props).toEqual({ locale: "en" });
  });
});

describe("StreamedStoreFooterResolver", () => {
  test("reads the store once a request is there, and renders its footer", async () => {
    readStore.mockResolvedValue(makeStore());
    const request = holdRequest(connection);

    const pending = StreamedStoreFooterResolver({ locale: "es" });
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();

    request.arrive();
    const footer = (await pending) as ReactElement<{
      locale: Locale;
      store: PublicStore;
    }>;

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(footer.type).toBe(StorePageFooter);
    expect(footer.props).toEqual({ locale: "es", store: makeStore() });
  });

  test("renders nothing when the store's row is missing", async () => {
    readStore.mockResolvedValue(null);

    await expect(
      StreamedStoreFooterResolver({ locale: "es" })
    ).resolves.toBeNull();
  });
});
