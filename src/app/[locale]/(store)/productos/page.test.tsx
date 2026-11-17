import { describe, expect, test, vi } from "vitest";

import AllArticlesPage, { generateMetadata, instant } from "./page";

const { catalogMetadata, CatalogPageView } = vi.hoisted(() => ({
  CatalogPageView: vi.fn(
    async (_props: unknown) => await Promise.resolve("page")
  ),
  catalogMetadata: vi.fn(
    async (_props: unknown) => await Promise.resolve({ title: "Todos" })
  ),
}));

// Every catalog page is one view (`catalog-page.test.tsx`); a route only
// hands it its address.
vi.mock("../catalog-page", () => ({ CatalogPageView, catalogMetadata }));

function makeProps() {
  return {
    params: Promise.resolve({ locale: "es" }),
    searchParams: Promise.resolve({ color: "dorado" }),
  };
}

describe("AllArticlesPage", () => {
  test("opts out of the instant-navigation check: it waits for its articles by design", () => {
    expect(instant).toBe(false);
  });

  test("renders the catalog view and its metadata for its own address", async () => {
    const props = makeProps();

    await expect(AllArticlesPage(props)).resolves.toBe("page");
    await expect(generateMetadata(props)).resolves.toEqual({ title: "Todos" });
    expect(CatalogPageView).toHaveBeenCalledExactlyOnceWith(props);
    expect(catalogMetadata).toHaveBeenCalledExactlyOnceWith(props);
  });
});
