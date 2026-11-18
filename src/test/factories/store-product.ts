import type { StoreProduct } from "@/lib/catalog/product-form";
import type { ProductFormValues } from "@/lib/schemas/catalog";

/**
 * An article as `product.get` answers it (FER-017): a published silver ring
 * with one photo, ready to stay published, unless a test says otherwise.
 */
export function makeStoreProduct(
  overrides: Partial<StoreProduct> = {}
): StoreProduct {
  return {
    attributeValueIds: [31],
    categoryId: 4,
    currencyCode: "UYU",
    id: 12,
    images: [
      {
        height: 900,
        id: 70,
        url: "https://store.public.blob.vercel-storage.com/local/product/11111111-1111-4111-8111-111111111111.webp",
        width: 900,
      },
    ],
    isAvailable: true,
    priceAmount: 129_000,
    publishGaps: [],
    publishedAt: new Date("2026-11-10T12:00:00.000Z"),
    slug: "anillo-de-plata",
    status: "published",
    translations: [
      {
        description: "Plata 925, hecho a mano.",
        locale: "es",
        seoDescription: null,
        seoTitle: null,
        title: "Anillo de plata",
      },
    ],
    updatedAt: new Date("2026-11-15T09:30:00.000Z"),
    ...overrides,
  };
}

/** The wizard's form holding a ready article, unless a test says otherwise. */
export function makeProductForm(
  overrides: Partial<ProductFormValues> = {}
): ProductFormValues {
  const blank = {
    description: "",
    seoDescription: "",
    seoTitle: "",
    title: "",
  };

  return {
    attributeValueIds: [31],
    categoryId: "4",
    en: blank,
    es: { ...blank, description: "Plata 925.", title: "Anillo de plata" },
    images: [
      {
        height: 900,
        url: "https://store.public.blob.vercel-storage.com/local/product/11111111-1111-4111-8111-111111111111.webp",
        width: 900,
      },
    ],
    isAvailable: true,
    price: 1290,
    ...overrides,
  };
}
