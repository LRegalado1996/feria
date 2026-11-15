import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { connection } from "next/server";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { OrderManager } from "@/app/_components/organisms/order-manager";
import { getDictionary } from "@/content";
import {
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
} from "@/lib/admin/access";
import { ordersPath, readOrdersQuery } from "@/lib/admin/orders";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";
import type { ListOrdersValues } from "@/lib/schemas/order";

/** Reading the clock is request-time IO, hence `connection()`. */
async function readRenderInstant() {
  await connection();
  return Date.now();
}

interface OrdersPageProps {
  params: Promise<{ locale: string; store: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * A store's orders (FER-027), behind the admin's per-page checks: a
 * session, and a store the login may work on. The status tab and the search
 * are the query string; the first page and the counts are fetched on the
 * server so the screen opens with them.
 */
export default function OrdersPage({ params, searchParams }: OrdersPageProps) {
  // The store and the selection are only known per request: read inside
  // the boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <OrdersResolver params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OrdersResolver({ params, searchParams }: OrdersPageProps) {
  const locale = await readLocale(params);
  const { store: segment } = await params;
  const slug = requireStoreSegment(segment);
  const query = readOrdersQuery(await searchParams);
  const { admin } = getDictionary(locale);
  // Signing in comes back to the same tab and search.
  const me = await requireAdmin(ordersPath(slug, locale, query), locale);
  const store = requireAdminStore(me, slug);
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state. The input matches `useOrders`, so the screen finds it.
  await Promise.all([
    queryClient
      .infiniteQuery(
        orpc.order.list.infiniteOptions({
          getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
          initialPageParam: undefined as ListOrdersValues["cursor"],
          input: (cursor) => ({
            cursor,
            q: query.q,
            status: query.status,
            storeSlug: slug,
          }),
        })
      )
      .catch(noop),
    queryClient
      .query(orpc.order.counts.queryOptions({ input: { storeSlug: slug } }))
      .catch(noop),
  ]);

  // After the request reads above, and after the list: an order is "new"
  // when it was placed after this instant, so one the list already has is not.
  const renderedAt = await readRenderInstant();

  // Above the shell: the navigation's count of orders to pack reads the
  // same counts as the tabs.
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminShell
        dictionary={admin}
        locale={locale}
        location={{ kind: "store", section: "orders", store }}
        role={me.role}
        stores={me.stores}
      >
        <OrderManager query={query} renderedAt={renderedAt} storeSlug={slug} />
      </AdminShell>
    </HydrationBoundary>
  );
}
