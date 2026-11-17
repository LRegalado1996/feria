import type { StoreCategory } from "@/server/services/category";

/**
 * A row of the admin's category list (`category.list`), with no group, no
 * page texts and no cover unless a test says so.
 */
export function makeStoreCategory(
  overrides: Partial<StoreCategory> = {}
): StoreCategory {
  return {
    cover: { computer: null, phone: null },
    coverAltEn: null,
    coverAltEs: null,
    id: 1,
    nameEn: null,
    nameEs: "Collares",
    parentId: null,
    position: 0,
    productCount: 0,
    seoDescriptionEn: null,
    seoDescriptionEs: null,
    seoTitleEn: null,
    seoTitleEs: null,
    slug: "collares",
    ...overrides,
  };
}
