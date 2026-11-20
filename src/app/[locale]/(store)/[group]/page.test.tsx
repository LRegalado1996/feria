import { describe, expect, test, vi } from "vitest";

import GroupPage, { generateMetadata, instant } from "./page";

const {
  CatalogPageView,
  catalogMetadata,
  resolveStorePage,
  StorePageView,
  storePageMetadata,
} = vi.hoisted(() => ({
  CatalogPageView: vi.fn(
    async (_props: unknown) => await Promise.resolve("catalog")
  ),
  StorePageView: vi.fn(
    async (_page: unknown) => await Promise.resolve("store page")
  ),
  catalogMetadata: vi.fn(
    async (_props: unknown) => await Promise.resolve({ title: "Bijouterie" })
  ),
  resolveStorePage: vi.fn<(props: unknown) => Promise<unknown>>(),
  storePageMetadata: vi.fn((_page: unknown) => ({ title: "Regalos" })),
}));

// Every catalog page is one view (`catalog-page.test.tsx`), and every page
// built from sections another (`store-page-view.test.tsx`); a route only
// hands them its address.
vi.mock("../catalog-page", () => ({ CatalogPageView, catalogMetadata }));

vi.mock("../store-page-view", () => ({
  resolveStorePage,
  StorePageView,
  storePageMetadata,
}));

function makeProps(group: string) {
  return {
    params: Promise.resolve({ group, locale: "en" }),
    searchParams: Promise.resolve({}),
  };
}

describe("GroupPage", () => {
  test("opts out of the instant-navigation check: it waits for its articles by design", () => {
    expect(instant).toBe(false);
  });

  test("renders the catalog view and its metadata for a group's address, no page being there", async () => {
    resolveStorePage.mockResolvedValue(null);
    const props = makeProps("bijouterie");

    await expect(GroupPage(props)).resolves.toBe("catalog");
    await expect(generateMetadata(props)).resolves.toEqual({
      title: "Bijouterie",
    });
    expect(resolveStorePage.mock.calls).toEqual([[props], [props]]);
    expect(CatalogPageView).toHaveBeenCalledExactlyOnceWith(props);
    expect(catalogMetadata).toHaveBeenCalledExactlyOnceWith(props);
    expect(StorePageView).not.toHaveBeenCalled();
  });

  test("renders a page built from sections and its metadata at its address (FER-060)", async () => {
    const page = { draft: false, locale: "en", page: { id: 2 } };
    resolveStorePage.mockResolvedValue(page);
    const props = makeProps("regalos");

    await expect(GroupPage(props)).resolves.toBe("store page");
    await expect(generateMetadata(props)).resolves.toEqual({
      title: "Regalos",
    });
    expect(StorePageView).toHaveBeenCalledExactlyOnceWith(page);
    expect(storePageMetadata).toHaveBeenCalledExactlyOnceWith(page);
    expect(CatalogPageView).not.toHaveBeenCalled();
    expect(catalogMetadata).not.toHaveBeenCalled();
  });
});
