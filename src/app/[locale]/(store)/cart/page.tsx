import type { Metadata } from "next";
import { connection } from "next/server";

import { StoreCheckout } from "@/app/_components/organisms/store-checkout";
import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { getDictionary } from "@/content";
import { CHECKOUT_PATH } from "@/lib/cart/paths";
import { buildAlternates } from "@/lib/i18n/metadata";
import { readLocale } from "@/lib/i18n/read-locale";
import { storeTitle } from "@/lib/seo/store-metadata";
import { readStore } from "@/server/cache/store";

import { StreamedStoreFooter } from "../store-page-footer";
import { streamedShell } from "../store-shell";

interface CheckoutPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * An order is one shopper's: never indexed. Its title ends in the store's
 * name, read at request time: the build has no database.
 */
export async function generateMetadata({
  params,
}: CheckoutPageProps): Promise<Metadata> {
  const locale = await readLocale(params);
  await connection();
  const store = await readStore();
  const title = getDictionary(locale).storefront.cart.page.title;

  return {
    alternates: buildAlternates(CHECKOUT_PATH, locale),
    robots: { follow: true, index: false },
    title: { absolute: store ? storeTitle(title, store.name) : title },
  };
}

/**
 * The checkout (FER-026, FER-045): the order's summary and the shopper's
 * details, where the cart's side panel leads and the header's cart links
 * before the page's script runs. Both live in the browser (one cart per
 * browser, FER-038), so the page's own output is the same for every visitor
 * and prerendered with the build; only what carries the store's details
 * (the bar, the header's categories, the footer) is read per request, and
 * streams in.
 */
export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const locale = await readLocale(params);

  return (
    <StoreFrame
      copy={getDictionary(locale).storefront.shell}
      locale={locale}
      {...streamedShell(locale)}
    >
      <main data-testid="store-checkout-page">
        <StoreCheckout />
      </main>
      <StreamedStoreFooter locale={locale} />
    </StoreFrame>
  );
}
