import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StoreCart } from "@/app/_components/organisms/store-cart";
import { getDictionary } from "@/content";
import { buildAlternates } from "@/lib/i18n/metadata";
import { readLocale } from "@/lib/i18n/read-locale";
import { getStoreForPath } from "@/server/cache/store";

interface CartPageProps {
  params: Promise<{ locale: string; store: string }>;
}

// Static output made on an address's first visit, like the store's home: the
// cart itself lives in the browser, so the server only checks the store and
// an unknown one is a real 404 (docs/agents/nextjs.md § Store pages).
export const ensureStatic = "navigation";

// The page waits on its store before anything is sent, by design.
export const instant = false;

/** A cart is one shopper's: never indexed. */
export async function generateMetadata({
  params,
}: CartPageProps): Promise<Metadata> {
  const locale = await readLocale(params);
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  if (!store) {
    return {};
  }

  return {
    alternates: buildAlternates(`/${store.slug}/cart`, locale),
    robots: { follow: true, index: false },
    title: getDictionary(locale).storefront.cart.title,
  };
}

/** A store's cart and checkout (FER-026). */
export default async function CartPage({ params }: CartPageProps) {
  const { store: segment } = await params;
  const store = await getStoreForPath(segment);

  if (!store) {
    notFound();
  }

  return (
    <main data-testid="store-cart-page">
      <StoreCart storeSlug={store.slug} />
    </main>
  );
}
