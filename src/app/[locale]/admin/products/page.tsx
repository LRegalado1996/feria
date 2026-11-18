import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { ProductList } from "@/app/_components/organisms/product-list";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { productsPath } from "@/lib/admin/products";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";
import type { StoreProductCursor } from "@/lib/schemas/catalog";

interface ProductsPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * The store's articles (FER-017), behind the admin's per-page check: a
 * session. The first page is fetched on the server so the screen opens
 * with it.
 */
export default function ProductsPage({ params }: ProductsPageProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <ProductsResolver params={params} />
    </Suspense>
  );
}

async function ProductsResolver({ params }: ProductsPageProps) {
  const locale = await readLocale(params);
  const { admin } = getDictionary(locale);
  const login = await requireAdmin(productsPath(locale), locale);
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state. The input matches `useProducts`, so the screen finds it.
  await queryClient
    .infiniteQuery(
      orpc.product.list.infiniteOptions({
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        initialPageParam: undefined as StoreProductCursor | undefined,
        input: (cursor) => ({ cursor }),
      })
    )
    .catch(noop);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="products"
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProductList />
      </HydrationBoundary>
    </AdminShell>
  );
}
