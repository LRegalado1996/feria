import type * as NextServer from "next/server";
import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { holdRequest, settle } from "@/test/connection";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(async () => {
    await Promise.resolve();
  }),
  readCategories: vi.fn(),
  readStore: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof NextServer>()),
  connection: mocks.connection,
}));

// The cached reads have their own tests; here they answer what the test says.
vi.mock("@/server/cache/store", () => ({ readStore: mocks.readStore }));
vi.mock("@/server/cache/catalog", () => ({
  readCategories: mocks.readCategories,
}));

const STORE = { id: 7 };

function setup({ store = STORE }: { store?: typeof STORE | null } = {}) {
  mocks.readStore.mockResolvedValue(store);
  mocks.readCategories.mockResolvedValue([
    { path: "/bijouterie/anillos", slug: "anillos" },
    { path: "/burbujeros", slug: "burbujeros" },
  ]);

  return {
    get: async (search: string, locale = "es") =>
      await GET(
        new NextRequest(`http://localhost:3000/${locale}/products${search}`),
        {
          params: Promise.resolve({ locale }),
        }
      ),
  };
}

describe("GET /products, the catalog's address before FER-043", () => {
  test.each([
    ["a category", "?category=anillos", "es", "/bijouterie/anillos"],
    [
      "a category with a filter, a search and a sort",
      "?category=anillos&color=dorado,plateado&q=oro&sort=price_asc",
      "es",
      "/bijouterie/anillos?color=dorado,plateado&q=oro&sort=price_asc",
    ],
    [
      "a category in no group, in English",
      "?category=burbujeros",
      "en",
      "/en/burbujeros",
    ],
    ["no category", "", "es", "/productos"],
    ["a filter alone", "?color=dorado", "en", "/en/productos?color=dorado"],
    [
      "a category the store no longer has",
      "?category=relojes&color=dorado",
      "es",
      "/productos?color=dorado",
    ],
    ["a malformed category", "?category=Anillos", "es", "/productos"],
  ])("sends %s to its page for good", async (_case, search, locale, target) => {
    const { get } = setup();

    const response = await get(search, locale);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(target);
  });

  test("reads the categories in the address's language, only once a request is there", async () => {
    const { get } = setup();
    const request = holdRequest(mocks.connection);

    const response = get("?category=anillos", "en");
    await settle();

    expect(mocks.readStore).not.toHaveBeenCalled();
    request.arrive();
    await response;
    expect(mocks.readCategories).toHaveBeenCalledExactlyOnceWith(STORE, "en");
  });

  test("reads nothing for an address without a category", async () => {
    const { get } = setup();

    await get("?color=dorado");

    expect(mocks.connection).not.toHaveBeenCalled();
    expect(mocks.readStore).not.toHaveBeenCalled();
  });

  test("sends a category to all articles before the store's row exists", async () => {
    const { get } = setup({ store: null });

    const response = await get("?category=anillos");

    expect(response.headers.get("location")).toBe("/productos");
    expect(mocks.readCategories).not.toHaveBeenCalled();
  });

  test("answers a language the site does not speak with a 404", async () => {
    const { get } = setup();

    const response = await get("?category=anillos", "fr");

    expect(response.status).toBe(404);
    expect(mocks.readStore).not.toHaveBeenCalled();
  });
});
