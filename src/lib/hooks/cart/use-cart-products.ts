import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { Locale } from "@/lib/i18n/config";
import { type client, orpc } from "@/lib/orpc/client";

export type CartProduct = Awaited<
  ReturnType<typeof client.catalog.cartProducts>
>[number];

/**
 * The cart's articles as the shop has them now (FER-026): read when the cart
 * opens and again when the window regains focus, so a price or a sold-out
 * article is seen before the order is placed. Taking an article out keeps
 * the rows already shown while the shorter list loads.
 */
export function useCartProducts({
  ids,
  locale,
  storeSlug,
}: {
  ids: number[];
  locale: Locale;
  storeSlug: string;
}) {
  return useQuery({
    ...orpc.catalog.cartProducts.queryOptions({
      input: { ids, locale, storeSlug },
    }),
    enabled: ids.length > 0,
    placeholderData: keepPreviousData,
    // Always the shop's word: a price seen a minute ago may be stale.
    staleTime: 0,
  });
}
