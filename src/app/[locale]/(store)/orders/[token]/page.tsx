import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { StoreOrder } from "@/app/_components/organisms/store-order";
import { getDictionary } from "@/content";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import { pickReorderCategory } from "@/lib/catalog/reorder";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { catchNotFound } from "@/lib/orpc/catch-not-found";
import { caller } from "@/lib/orpc/server";
import { ORDER_TOKEN_PATTERN } from "@/lib/schemas/order";
import { storeTitle } from "@/lib/seo/store-metadata";
import type { Currency } from "@/lib/utils/format";
import {
  readCategories,
  readCategoryArticles,
  readCategoryCounts,
} from "@/server/cache/catalog";
import { readStore } from "@/server/cache/store";

import { StorePageFooter } from "../../store-page-footer";
import { shellOf } from "../../store-shell";

// The order's status changes after it is placed, so the page is read per
// request; it waits on the order before anything is sent, by design.
export const instant = false;

interface OrderPageProps {
  params: Promise<{ locale: string; token: string }>;
}

/**
 * The store and the order, or `null` when the order is missing. A token that
 * cannot be one costs no query; the read is shared by the metadata and the
 * page within one request.
 */
const loadOrder = cache(async (token: string) => {
  if (!ORDER_TOKEN_PATTERN.test(token)) {
    return null;
  }

  const store = await readStore();

  if (!store) {
    return null;
  }

  const order = await catchNotFound(caller.order.getByToken({ token }));

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
  const { token } = await params;
  const found = await loadOrder(token);

  return {
    referrer: "no-referrer",
    robots: { follow: false, index: false },
    ...(found
      ? {
          title: {
            absolute: storeTitle(
              interpolate(getDictionary(locale).storefront.order.title, {
                code: found.order.code,
              }),
              found.store.name
            ),
          },
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

/**
 * The row under the order's band (FER-051): one category drawn at random per
 * visit from the cached counts, then its cached articles. The page is read
 * per request, so drawing here costs no cache entry and hydrates as drawn.
 */
async function againRow(
  store: { currencyCode: Currency; id: number },
  locale: Locale
) {
  const categoryId = pickReorderCategory(
    await readCategoryCounts(store),
    Math.random
  );
  const found =
    categoryId === null
      ? undefined
      : (await readCategories(store, locale)).find(
          (entry) => entry.id === categoryId
        );

  if (categoryId === null || !found) {
    return null;
  }

  return {
    articles: await readCategoryArticles(store, categoryId, locale),
    href: localizePath(found.path, locale),
    name: found.name,
  };
}

async function OrderResolver({ params }: OrderPageProps) {
  const locale = await readLocale(params);
  const { token } = await params;
  const found = await loadOrder(token);

  if (!found) {
    notFound();
  }

  const { order, store } = found;
  const { storefront } = getDictionary(locale);

  // Its frame too waits for the read: the language is in the same params
  // as the token, which nothing may await outside this boundary.
  return (
    <StoreFrame
      copy={storefront.shell}
      locale={locale}
      {...await shellOf(store, locale)}
    >
      <main data-testid="store-order-page">
        <StoreOrder
          again={await againRow(store, locale)}
          catalogHref={localizePath(ALL_ARTICLES_PATH, locale)}
          copy={storefront}
          locale={locale}
          order={order}
          whatsappHref={whatsappHref(store.whatsappNumber, order.code, locale)}
        />
      </main>
      <StorePageFooter locale={locale} store={store} />
    </StoreFrame>
  );
}
