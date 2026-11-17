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

const { connection, readStore } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  readStore: vi.fn<() => Promise<PublicStore | null>>(),
}));

// `server-only` throws on import outside a React Server Components build.
vi.mock("server-only", () => ({}));

vi.mock("next/server", () => ({ connection }));

vi.mock("@/server/cache/store", () => ({ readStore }));

// The footer has its own tests; here it shows what the page handed it.
vi.mock("@/app/_components/organisms/store-footer", () => ({
  StoreFooter: ({ className, copy, store, tagline }: StoreFooterProps) => (
    <footer className={className} data-testid="footer">
      {`${store.name} | ${copy.footer} | ${tagline ? `${tagline.lang}: ${tagline.text}` : "no tagline"}`}
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
    ["es", "Pie de la tienda", "es: Joyas en la feria"],
    ["en", "Store footer", "en: Jewelry at the fair"],
  ] as const)(
    "in %s, hands the footer the store, the page's words and its tagline in that language",
    (locale, footer, tagline) => {
      render(<StorePageFooter locale={locale} store={makeStore()} />);

      expect(screen.getByTestId("footer")).toHaveTextContent(
        `LR Market | ${footer} | ${tagline}`
      );
    }
  );

  test("hands the Spanish tagline, marked as Spanish, to an English page of a store written only in Spanish", () => {
    render(
      <StorePageFooter
        locale="en"
        store={makeStore({ translations: [SPANISH] })}
      />
    );

    expect(screen.getByTestId("footer")).toHaveTextContent(
      "es: Joyas en la feria"
    );
  });

  test("hands no tagline when the store has no texts", () => {
    render(
      <StorePageFooter locale="es" store={makeStore({ translations: [] })} />
    );

    expect(screen.getByTestId("footer")).toHaveTextContent("no tagline");
  });

  test("sits at the bottom of a short page", () => {
    render(<StorePageFooter locale="es" store={makeStore()} />);

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

    const footer = StreamedStoreFooterResolver({ locale: "es" });
    await settle();

    expect(connection).toHaveBeenCalledExactlyOnceWith();
    expect(readStore).not.toHaveBeenCalled();

    request.arrive();
    render(await footer);

    expect(readStore).toHaveBeenCalledExactlyOnceWith();
    expect(screen.getByTestId("footer")).toHaveTextContent("LR Market");
  });

  test("renders nothing when the store's row is missing", async () => {
    readStore.mockResolvedValue(null);

    await expect(
      StreamedStoreFooterResolver({ locale: "es" })
    ).resolves.toBeNull();
  });
});
