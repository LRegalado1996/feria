import type { Metadata } from "next";
import { connection } from "next/server";

import { StoreCart } from "@/app/_components/organisms/store-cart";
import { getDictionary } from "@/content";
import { buildAlternates } from "@/lib/i18n/metadata";
import { readLocale } from "@/lib/i18n/read-locale";
import { storeTitle } from "@/lib/seo/store-metadata";
import { readStore } from "@/server/cache/store";

import { StreamedStoreFooter } from "../store-page-footer";

interface CartPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * A cart is one shopper's: never indexed. Its title ends in the store's
 * name, read at request time: the build has no database.
 */
export async function generateMetadata({
  params,
}: CartPageProps): Promise<Metadata> {
  const locale = await readLocale(params);
  await connection();
  const store = await readStore();
  const title = getDictionary(locale).storefront.cart.title;

  return {
    alternates: buildAlternates("/cart", locale),
    robots: { follow: true, index: false },
    title: { absolute: store ? storeTitle(title, store.name) : title },
  };
}

/**
 * The cart and the checkout (FER-026). Both live in the browser (one cart
 * per browser, FER-038), so the page's own output is the same for every
 * visitor and prerendered with the build; only the footer, which carries the
 * store's details, is read per request.
 */
export default async function CartPage({ params }: CartPageProps) {
  const locale = await readLocale(params);

  return (
    <>
      <main data-testid="store-cart-page">
        <StoreCart />
      </main>
      <StreamedStoreFooter locale={locale} />
    </>
  );
}
