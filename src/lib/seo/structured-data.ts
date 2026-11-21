import type { BRAND_LOGO_FILES } from "@/lib/brand/logo-svg";
import type { Currency } from "@/lib/utils/format";

const LOGO_FILE = "lr-market-logo.svg" satisfies keyof typeof BRAND_LOGO_FILES;

/**
 * The brand's logo for search engines, a path of this site: the logo is
 * code, not data (`docs/brand/brand.md`).
 */
export const STORE_LOGO_PATH = `/brand/${LOGO_FILE}`;

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

/**
 * The site as schema.org knows it (FER-022): the name search engines show
 * for it, its home and the language of this page.
 */
export function webSite(site: { locale: string; name: string; url: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    inLanguage: site.locale,
  };
}

/**
 * A list of articles a page shows as one block (FER-022: a row of the
 * home), named as on the page, its items in their order there.
 */
export function itemList(list: { items: Crumb[]; name: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: list.name,
    numberOfItems: list.items.length,
    itemListElement: list.items.map((item, index) => ({
      "@type": "ListItem",
      name: item.name,
      position: index + 1,
      url: item.url,
    })),
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
 * A catalog page as a schema.org `CollectionPage` (FER-043): its name, its
 * description and address, the trail to it, and the articles it shows first
 * as an `ItemList`, in their order on the page.
 */
export function collectionPage(page: {
  breadcrumb: Crumb[];
  description: string;
  items: Crumb[];
  locale: string;
  name: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.name,
    description: page.description,
    url: page.url,
    inLanguage: page.locale,
    breadcrumb: breadcrumbList(page.breadcrumb),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: page.items.length,
      itemListElement: page.items.map((item, index) => ({
        "@type": "ListItem",
        name: item.name,
        position: index + 1,
        url: item.url,
      })),
    },
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
