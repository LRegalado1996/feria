import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { Locale } from "@/lib/i18n/config";
import { type client, orpc } from "@/lib/orpc/client";

export type CartProduct = Awaited<
  ReturnType<typeof client.catalog.cartProducts>
>[number];

/**
 * The newest answer the shop gave about any cart in this language: a cart
 * that just grew (FER-045: adding opens the panel) shows the articles it
 * already had at once, while the one added waits for its price.
 */
function newestAnswer(
  queryClient: QueryClient,
  locale: Locale
): CartProduct[] | undefined {
  let newest: { at: number; data: CartProduct[] } | undefined;

  for (const [key, data] of queryClient.getQueriesData<CartProduct[]>({
    queryKey: orpc.catalog.cartProducts.key({ input: { locale } }),
  })) {
    const at = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;

    if (data && (!newest || at > newest.at)) {
      newest = { at, data };
    }
  }

  return newest?.data;
}

/**
 * The cart's articles as the shop has them now (FER-026): read when the cart
 * opens and again when the window regains focus, so a price or a sold-out
 * article is seen before the order is placed. While a changed list loads,
 * the last answer stays on screen as a placeholder (`isPlaceholderData`):
 * this list's own, else the newest about another cart, so the rows already
 * shown stay and an article without an answer yet is pending.
 */
export function useCartProducts({
  ids,
  locale,
}: {
  ids: number[];
  locale: Locale;
}) {
  const queryClient = useQueryClient();

  return useQuery({
    ...orpc.catalog.cartProducts.queryOptions({ input: { ids, locale } }),
    enabled: ids.length > 0,
    placeholderData: (previous) =>
      previous ?? newestAnswer(queryClient, locale),
    // Always the shop's word: a price seen a minute ago may be stale.
    staleTime: 0,
  });
}
