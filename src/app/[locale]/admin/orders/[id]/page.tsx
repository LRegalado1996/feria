import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { OrderDetail } from "@/app/_components/organisms/order-detail";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { orderPath, readOrderId, readOrdersQuery } from "@/lib/admin/orders";
import { readLocale } from "@/lib/i18n/read-locale";
import { catchNotFound } from "@/lib/orpc/catch-not-found";
import { getQueryClient, orpc } from "@/lib/orpc/server";

/** Reading the clock is request-time IO, hence `connection()`. */
async function readRenderInstant() {
  await connection();
  return Date.now();
}

interface OrderPageProps {
  params: Promise<{ id: string; locale: string }>;
  /** The list's tab and search it was opened from, for the way back. */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * One of the store's orders (FER-027), behind the admin's per-page check. An
 * address no order can have, or an order the store does not have, is the
 * not-found page.
 */
export default function OrderPage({ params, searchParams }: OrderPageProps) {
  // The order and the list it came from are only known per request: read
  // inside the boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <OrderResolver params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function OrderResolver({ params, searchParams }: OrderPageProps) {
  const locale = await readLocale(params);
  const { id: idSegment } = await params;
  // Not an id at all: no session check, no query.
  const id = readOrderId(idSegment);

  if (id === null) {
    notFound();
  }

  // Checked as the list checks it: anyone can edit an address.
  const from = readOrdersQuery(await searchParams);
  const { admin } = getDictionary(locale);
  await requireAdmin(orderPath(id, locale, from), locale);
  const queryClient = getQueryClient();
  // An order the store does not have is NOT_FOUND. Any other failure is not
  // a 404: the screen fetches again and shows its own error state.
  const found = await catchNotFound(
    queryClient.query(orpc.order.get.queryOptions({ input: { id } }))
  ).catch(noop);

  if (found === null) {
    notFound();
  }

  // After the request reads above: the clock the page's times start from.
  const renderedAt = await readRenderInstant();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AdminShell dictionary={admin} locale={locale} section="orders">
        <OrderDetail from={from} id={id} renderedAt={renderedAt} />
      </AdminShell>
    </HydrationBoundary>
  );
}
