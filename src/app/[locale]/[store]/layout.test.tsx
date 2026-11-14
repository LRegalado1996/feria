import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { PublicStore } from "@/server/services/store";

import StoreLayout, { generateStaticParams } from "./layout";

const { getStoreForPath } = vi.hoisted(() => ({
  getStoreForPath: vi.fn<(segment: string) => Promise<PublicStore | null>>(),
}));

// The cached read has its own tests; here it answers by the segment it got.
vi.mock("@/server/cache/store", () => ({ getStoreForPath }));

function makeStore(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    colorAccent: "#ff8a3d",
    colorBackground: "#fff4e6",
    colorContrast: "#3d1f47",
    colorForeground: "#2b1a12",
    colorSurface: "#fffaf5",
    currencyCode: "USD",
    id: 7,
    instagramUrl: null,
    logoUrl: null,
    name: "Sample Store",
    slug: "sample-store",
    tiktokUrl: null,
    translations: [],
    whatsappNumber: null,
    ...overrides,
  };
}

async function setup({
  segment = "sample-store",
  store = makeStore(),
}: { segment?: string; store?: PublicStore } = {}) {
  getStoreForPath.mockImplementation(
    async (asked) => await Promise.resolve(asked === store.slug ? store : null)
  );

  render(
    await StoreLayout({
      children: <p>Page content</p>,
      params: Promise.resolve({ locale: "es", store: segment }),
    })
  );

  return { theme: screen.getByTestId("store-theme") };
}

describe("StoreLayout", () => {
  test("writes the store's five colors over the storefront tokens", async () => {
    const { theme } = await setup();

    expect({
      accent: theme.style.getPropertyValue("--store-accent"),
      background: theme.style.getPropertyValue("--store-background"),
      contrast: theme.style.getPropertyValue("--store-contrast"),
      foreground: theme.style.getPropertyValue("--store-foreground"),
      surface: theme.style.getPropertyValue("--store-surface"),
    }).toEqual({
      accent: "#ff8a3d",
      background: "#fff4e6",
      contrast: "#3d1f47",
      foreground: "#2b1a12",
      surface: "#fffaf5",
    });
  });

  test("another store gets its own colors", async () => {
    const { theme } = await setup({
      segment: "other-store",
      store: makeStore({ colorAccent: "#c8f31d", slug: "other-store" }),
    });

    expect(theme.style.getPropertyValue("--store-accent")).toBe("#c8f31d");
  });

  test("marks the element so CSS derives the muted colors from this palette", async () => {
    const { theme } = await setup();

    expect(theme).toHaveAttribute("data-store-palette");
    expect(theme).toHaveAttribute("data-slot", "store-theme");
  });

  test("paints the page in the store's background and wraps the page", async () => {
    const { theme } = await setup();

    expect(theme).toHaveClass(
      "min-h-screen",
      "bg-store-background",
      "text-store-foreground"
    );
    expect(theme).toContainElement(screen.getByText("Page content"));
  });

  test("answers 404 for an address that is not an active store", async () => {
    getStoreForPath.mockResolvedValue(null);

    await expect(
      StoreLayout({
        children: <p>Page content</p>,
        params: Promise.resolve({ locale: "es", store: "nobody" }),
      })
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(getStoreForPath).toHaveBeenCalledExactlyOnceWith("nobody");
  });
});

describe("generateStaticParams", () => {
  test("returns one sample segment that can never be a store's address", () => {
    expect(generateStaticParams()).toEqual([{ store: "__sample__" }]);
  });
});
