import type { Currency } from "@/lib/utils/format";

/** A crumb on the way to a page: its name and its absolute URL. */
export interface Crumb {
  name: string;
  url: string;
}

/** The store as schema.org knows a seller: its name, home and profiles. */
export function storeOrganization(store: {
  instagramUrl: string | null;
  logoUrl: string | null;
  name: string;
  tiktokUrl: string | null;
  url: string;
}) {
  const sameAs = [store.instagramUrl, store.tiktokUrl].filter(
    (link) => link !== null
  );

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: store.name,
    url: store.url,
    ...(store.logoUrl ? { logo: store.logoUrl } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };
}

/** The trail from the store's home to the page, in order. */
export function breadcrumbList(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      item: crumb.url,
      name: crumb.name,
      position: index + 1,
    })),
  };
}

/**
 * An article as a schema.org `Product` with its `Offer` (FER-024): only
 * what the page shows, its price in major units with two decimals, as
 * schema.org expects, and whether it can be bought now.
 */
export function productWithOffer(article: {
  category: string | null;
  currency: Currency;
  description: string;
  images: string[];
  isAvailable: boolean;
  name: string;
  priceAmount: number;
  sku: string;
  storeName: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: article.name,
    sku: article.sku,
    url: article.url,
    brand: { "@type": "Brand", name: article.storeName },
    ...(article.description ? { description: article.description } : {}),
    ...(article.images.length > 0 ? { image: article.images } : {}),
    ...(article.category ? { category: article.category } : {}),
    offers: {
      "@type": "Offer",
      availability: article.isAvailable
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      price: (article.priceAmount / 100).toFixed(2),
      priceCurrency: article.currency,
      seller: { "@type": "Organization", name: article.storeName },
      url: article.url,
    },
  };
}
