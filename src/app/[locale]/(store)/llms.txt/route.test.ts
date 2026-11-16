import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";

import { GET } from "./route";

vi.mock("server-only", () => ({}));

const services = vi.hoisted(() => ({
  getStoreForPath: vi.fn(),
  listIndexableArticles: vi.fn(),
  listIndexableCategories: vi.fn(),
}));

vi.mock("@/server/cache/store", () => ({
  getStoreForPath: services.getStoreForPath,
}));

vi.mock("@/server/services/seo", () => ({
  listIndexableArticles: services.listIndexableArticles,
  listIndexableCategories: services.listIndexableCategories,
}));

const ORIGIN = "https://lrmarket.example";
const STORE = {
  currencyCode: "UYU",
  id: 7,
  name: "LR Market",
  slug: "lr-market",
  translations: [
    { description: "Bijou en Montevideo.", locale: "es", tagline: "Bijou" },
  ],
};

/** A request for `/{locale}/{store}/llms.txt`; `lr-market` is the active store. */
function setup() {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  services.getStoreForPath.mockImplementation(
    async (segment: string) =>
      await Promise.resolve(segment === STORE.slug ? STORE : null)
  );
  services.listIndexableArticles.mockResolvedValue([
    {
      priceAmount: 69_000,
      slug: "anillo-sello",
      titles: [{ locale: "es", title: "Anillo sello" }],
    },
  ]);
  services.listIndexableCategories.mockResolvedValue([
    { name: "Anillos", slug: "anillos" },
  ]);

  return {
    get: async (locale: string, store: string) =>
      await GET(new Request(`${ORIGIN}/${locale}/${store}/llms.txt`), {
        params: Promise.resolve({ locale, store }),
      }),
  };
}

describe("GET /[locale]/[store]/llms.txt", () => {
  test.each([
    ["es", "## Categorías", `${ORIGIN}/lr-market/products/anillo-sello`],
    ["en", "## Categories", `${ORIGIN}/en/lr-market/products/anillo-sello`],
  ])(
    "serves the active store's file in %s as Markdown",
    async (locale, heading, articleUrl) => {
      const { get } = setup();

      const response = await get(locale, "lr-market");
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/markdown; charset=utf-8"
      );
      expect(body.startsWith("# LR Market\n\n> Bijou\n")).toBe(true);
      expect(body).toContain(`${heading}\n`);
      expect(body).toContain(`(${articleUrl})`);
      expect(services.listIndexableArticles).toHaveBeenCalledExactlyOnceWith(
        db,
        { storeId: 7 }
      );
      expect(services.listIndexableCategories).toHaveBeenCalledExactlyOnceWith(
        db,
        { locale, storeId: 7 }
      );
    }
  );

  test("answers 404 for an unknown or inactive store, listing nothing", async () => {
    const { get } = setup();

    const response = await get("es", "tienda-cerrada");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(services.getStoreForPath).toHaveBeenCalledExactlyOnceWith(
      "tienda-cerrada"
    );
    expect(services.listIndexableArticles).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any lookup", async () => {
    const { get } = setup();

    const response = await get("fr", "lr-market");

    expect(response.status).toBe(404);
    expect(services.getStoreForPath).not.toHaveBeenCalled();
  });
});
