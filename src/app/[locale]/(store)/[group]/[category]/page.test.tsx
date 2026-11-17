import { describe, expect, test, vi } from "vitest";

import CategoryPage, { generateMetadata, instant } from "./page";

const { catalogMetadata, CatalogPageView } = vi.hoisted(() => ({
  CatalogPageView: vi.fn(
    async (_props: unknown) => await Promise.resolve("page")
  ),
  catalogMetadata: vi.fn(
    async (_props: unknown) => await Promise.resolve({ title: "Anillos" })
  ),
}));

// Every catalog page is one view (`catalog-page.test.tsx`); a route only
// hands it its address.
vi.mock("../../catalog-page", () => ({ CatalogPageView, catalogMetadata }));

describe("CategoryPage", () => {
  test("opts out of the instant-navigation check: it waits for its articles by design", () => {
    expect(instant).toBe(false);
  });

  test("renders the catalog view and its metadata for the category's address under its group", async () => {
    const props = {
      params: Promise.resolve({
        category: "anillos",
        group: "bijouterie",
        locale: "es",
      }),
      searchParams: Promise.resolve({ sort: "price_asc" }),
    };

    await expect(CategoryPage(props)).resolves.toBe("page");
    await expect(generateMetadata(props)).resolves.toEqual({
      title: "Anillos",
    });
    expect(CatalogPageView).toHaveBeenCalledExactlyOnceWith(props);
    expect(catalogMetadata).toHaveBeenCalledExactlyOnceWith(props);
  });
});
