import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import { holdRequest, settle } from "@/test/connection";

import { GET } from "./route";

vi.mock("server-only", () => ({}));

const services = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  findIndexableStore: vi.fn(),
  listIndexableArticles: vi.fn(),
  listIndexableCategories: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: services.connection }));

vi.mock("@/server/services/seo", () => ({
  findIndexableStore: services.findIndexableStore,
  listIndexableArticles: services.listIndexableArticles,
  listIndexableCategories: services.listIndexableCategories,
}));

const ORIGIN = "https://lrmarket.example";

function makeStore() {
  return {
    currencyCode: "UYU",
    id: 7,
    name: "LR Market",
    translations: [
      { description: "Bijou en Montevideo.", locale: "es", tagline: "Bijou" },
    ],
    updatedAt: new Date("2026-11-10T12:00:00.000Z"),
  };
}

/** A request for `/{locale}/llms.txt`; `store: null` is a missing row. */
function setup({
  store = makeStore(),
}: { store?: ReturnType<typeof makeStore> | null } = {}) {
  vi.stubEnv("BETTER_AUTH_URL", ORIGIN);
  services.findIndexableStore.mockResolvedValue(store);
  services.listIndexableArticles.mockResolvedValue([
    {
      priceAmount: 69_000,
      slug: "anillo-sello",
      titles: [{ locale: "es", title: "Anillo sello" }],
    },
  ]);
  services.listIndexableCategories.mockResolvedValue([
    { name: "Anillos", path: "/bijouterie/anillos", slug: "anillos" },
  ]);

  return {
    get: async (locale: string) =>
      await GET(new Request(`${ORIGIN}/${locale}/llms.txt`), {
        params: Promise.resolve({ locale }),
      }),
  };
}

describe("GET /[locale]/llms.txt", () => {
  test.each([
    [
      "es",
      "## Categorías",
      `${ORIGIN}/bijouterie/anillos`,
      `${ORIGIN}/productos/anillo-sello`,
      `${ORIGIN}/en/llms.txt`,
    ],
    [
      "en",
      "## Categories",
      `${ORIGIN}/en/bijouterie/anillos`,
      `${ORIGIN}/en/productos/anillo-sello`,
      `${ORIGIN}/llms.txt`,
    ],
  ])(
    "serves the store's file in %s as Markdown, every link without a store in it",
    async (locale, heading, categoryUrl, articleUrl, otherLanguageUrl) => {
      const { get } = setup();

      const response = await get(locale);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/markdown; charset=utf-8"
      );
      expect(body.startsWith("# LR Market\n\n> Bijou\n")).toBe(true);
      expect(body).toContain(`${heading}\n`);
      expect(body).toContain(`(${categoryUrl})`);
      expect(body).toContain(`(${articleUrl})`);
      expect(body).toContain(`(${otherLanguageUrl})`);
      expect(services.findIndexableStore).toHaveBeenCalledExactlyOnceWith(db);
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

  test("reads the store only once a request is there, so the build needs no database", async () => {
    const { get } = setup();
    const request = holdRequest(services.connection);

    const response = get("es");
    await settle();

    expect(services.connection).toHaveBeenCalledExactlyOnceWith();
    expect(services.findIndexableStore).not.toHaveBeenCalled();

    request.arrive();

    expect((await response).status).toBe(200);
    expect(services.findIndexableStore).toHaveBeenCalledExactlyOnceWith(db);
  });

  test("answers 404 when the store's row is missing, listing nothing", async () => {
    const { get } = setup({ store: null });

    const response = await get("es");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(services.listIndexableArticles).not.toHaveBeenCalled();
    expect(services.listIndexableCategories).not.toHaveBeenCalled();
  });

  test("answers 404 for a language the product does not speak, before any read", async () => {
    const { get } = setup();

    const response = await get("fr");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(services.connection).not.toHaveBeenCalled();
    expect(services.findIndexableStore).not.toHaveBeenCalled();
  });
});
