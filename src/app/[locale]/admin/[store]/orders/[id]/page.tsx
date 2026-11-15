import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { OrderDetail } from "@/app/_components/organisms/order-detail";
import { getDictionary } from "@/content";
import {
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
} from "@/lib/admin/access";
import { orderPath, readOrderId } from "@/lib/admin/orders";
import { readLocale } from "@/lib/i18n/read-locale";
import { catchNotFound } from "@/lib/orpc/catch-not-found";
import { getQueryClient, orpc } from "@/lib/orpc/server";

/** Reading the clock is request-time IO, hence `connection()`. */
async function readRenderInstant() {
  await connection();
  return Date.now();
}

interface OrderPageProps {
  params: Promise<{ id: string; locale: string; store: string }>;
}

/**
 * One of a store's orders (FER-027), behind the admin's per-page checks. An
 * address no order can have, or an order this store does not have, is the
 * not-found page.
 */
export default function OrderPage({ params }: OrderPageProps) {
  // The store and the order are only known per request: the params are read
  // inside the boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <OrderResolver params={params} />
    </Suspense>
  );
}

async function OrderResolver({ params }: OrderPageProps) {
  const locale = await readLocale(params);
  const { id: idSegment, store: segment } = await params;
  const slug = requireStoreSegment(segment);
  // Not an id at all: no session check, no query.
  const id = readOrderId(idSegment);

  if (id === null) {
    notFound();
  }

  const { admin } = getDictionary(locale);
  const me = await requireAdmin(orderPath(slug, id, locale), locale);
  const store = requireAdminStore(me, slug);
  const queryClient = getQueryClient();
  // Another store's order is NOT_FOUND too. Any other failure is not a 404:
  // the screen fetches again and shows its own error state.
  const found = await catchNotFound(
    queryClient.query(
      orpc.order.get.queryOptions({ input: { id, storeSlug: slug } })
    )
  ).catch(noop);

  if (found === null) {
    notFound();
  }

  // After the request reads above: the clock the page's times start from.
  const renderedAt = await readRenderInstant();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminShell
        dictionary={admin}
        locale={locale}
        location={{ kind: "store", section: "orders", store }}
        role={me.role}
        stores={me.stores}
      >
        <OrderDetail id={id} renderedAt={renderedAt} storeSlug={slug} />
      </AdminShell>
    </HydrationBoundary>
  );
}
