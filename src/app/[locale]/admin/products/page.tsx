import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { connection } from "next/server";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { ProductList } from "@/app/_components/organisms/product-list";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import {
  productsListInput,
  productsPath,
  readProductsQuery,
} from "@/lib/admin/products";
import type { RawSearchParams } from "@/lib/catalog/query";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";

/** Reading the clock is request-time IO, hence `connection()`. */
async function readRenderInstant() {
  await connection();
  return Date.now();
}

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * The store's articles (FER-017, FER-019), behind the admin's per-page
 * check: a session. The page, the search, the filters and the sort are the
 * query string; the page they name, the categories and the filters are
 * fetched on the server so the screen opens with them.
 */
export default function ProductsPage({
  params,
  searchParams,
}: ProductsPageProps) {
  // The session and the selection are only known per request: read inside
  // the boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <ProductsResolver params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductsResolver({ params, searchParams }: ProductsPageProps) {
  const locale = await readLocale(params);
  const query = readProductsQuery(await searchParams);
  const { admin } = getDictionary(locale);
  // Signing in comes back to the same selection.
  const login = await requireAdmin(productsPath(locale, query), locale);
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state. The input is the screen's own (`productsListInput`), so
  // the screen finds it.
  await Promise.all([
    queryClient
      .query(
        orpc.product.list.queryOptions({
          input: productsListInput(query, locale),
        })
      )
      .catch(noop),
    queryClient.query(orpc.category.list.queryOptions()).catch(noop),
    queryClient.query(orpc.attribute.list.queryOptions()).catch(noop),
  ]);

  // After the request reads above: the clock the rows' ages start from, the
  // same on the server and in the hydrating render.
  const renderedAt = await readRenderInstant();

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="products"
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProductList query={query} renderedAt={renderedAt} />
      </HydrationBoundary>
    </AdminShell>
  );
}
