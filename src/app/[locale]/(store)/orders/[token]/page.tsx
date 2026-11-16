import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { StoreOrder } from "@/app/_components/organisms/store-order";
import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { catchNotFound } from "@/lib/orpc/catch-not-found";
import { caller } from "@/lib/orpc/server";
import { ORDER_TOKEN_PATTERN } from "@/lib/schemas/order";
import { getStoreForPath } from "@/server/cache/store";

// The order's status changes after it is placed, so the page is read per
// request; it waits on the order before anything is sent, by design.
export const instant = false;

interface OrderPageProps {
  params: Promise<{ locale: string; store: string; token: string }>;
}

/**
 * The store and its order, or `null` when either is missing. A token that
 * cannot be one costs no query; the read is shared by the metadata and the
 * page within one request.
 */
const loadOrder = cache(async (segment: string, token: string) => {
  const store = await getStoreForPath(segment);

  if (!(store && ORDER_TOKEN_PATTERN.test(token))) {
    return null;
  }

  const order = await catchNotFound(
    caller.order.getByToken({ storeSlug: store.slug, token })
  );

  return order ? { order, store } : null;
});

/**
 * Someone's order: never indexed, its title its code. No referrer from it:
 * its address is the order's key, and a link followed from it (the shop's
 * WhatsApp, an article) must not carry the token to another server.
 */
export async function generateMetadata({
  params,
}: OrderPageProps): Promise<Metadata> {
  const locale = await readLocale(params);
  const { store: segment, token } = await params;
  const found = await loadOrder(segment, token);

  return {
    referrer: "no-referrer",
    robots: { follow: false, index: false },
    ...(found
      ? {
          title: interpolate(getDictionary(locale).storefront.order.title, {
            code: found.order.code,
          }),
        }
      : {}),
  };
}

/** A placed order, reached by its link without an account (FER-026). */
export default function OrderPage({ params }: OrderPageProps) {
  return (
    <Suspense fallback={null}>
      <OrderResolver params={params} />
    </Suspense>
  );
}

/** A chat with the store about `code`, when the store has WhatsApp. */
function whatsappHref(
  whatsappNumber: string | null,
  code: string,
  locale: Locale
) {
  if (!whatsappNumber) {
    return null;
  }

  const text = interpolate(
    getDictionary(locale).storefront.order.contactStoreText,
    {
      code,
    }
  );

  return `https://wa.me/${whatsappNumber.replaceAll(/\D/gu, "")}?text=${encodeURIComponent(text)}`;
}

async function OrderResolver({ params }: OrderPageProps) {
  const locale = await readLocale(params);
  const { store: segment, token } = await params;
  const found = await loadOrder(segment, token);

  if (!found) {
    notFound();
  }

  const { order, store } = found;
  const { storefront } = getDictionary(locale);

  return (
    <main data-testid="store-order-page">
      <StoreOrder
        catalogHref={localizePath(`/${store.slug}/products`, locale)}
        labels={storefront.order}
        locale={locale}
        newTabLabel={storefront.shell.newTab}
        order={order}
        whatsappHref={whatsappHref(store.whatsappNumber, order.code, locale)}
      />
    </main>
  );
}
