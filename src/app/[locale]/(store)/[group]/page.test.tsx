import { describe, expect, test, vi } from "vitest";

import GroupPage, { generateMetadata, instant } from "./page";

const { catalogMetadata, CatalogPageView } = vi.hoisted(() => ({
  CatalogPageView: vi.fn(
    async (_props: unknown) => await Promise.resolve("page")
  ),
  catalogMetadata: vi.fn(
    async (_props: unknown) => await Promise.resolve({ title: "Bijouterie" })
  ),
}));

// Every catalog page is one view (`catalog-page.test.tsx`); a route only
// hands it its address.
vi.mock("../catalog-page", () => ({ CatalogPageView, catalogMetadata }));

describe("GroupPage", () => {
  test("opts out of the instant-navigation check: it waits for its articles by design", () => {
    expect(instant).toBe(false);
  });

  test("renders the catalog view and its metadata for the group's address", async () => {
    const props = {
      params: Promise.resolve({ group: "bijouterie", locale: "en" }),
      searchParams: Promise.resolve({}),
    };

    await expect(GroupPage(props)).resolves.toBe("page");
    await expect(generateMetadata(props)).resolves.toEqual({
      title: "Bijouterie",
    });
    expect(CatalogPageView).toHaveBeenCalledExactlyOnceWith(props);
    expect(catalogMetadata).toHaveBeenCalledExactlyOnceWith(props);
  });
});
