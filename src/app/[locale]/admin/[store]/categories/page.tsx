import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { CategoryManager } from "@/app/_components/organisms/category-manager";
import { getDictionary } from "@/content";
import {
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
} from "@/lib/admin/access";
import { storeSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";

interface CategoriesPageProps {
  params: Promise<{ locale: string; store: string }>;
}

/**
 * A store's categories (FER-016), behind the admin's per-page checks: a
 * session, and a store the login may work on. The list is fetched on the
 * server so the screen opens with it.
 */
export default function CategoriesPage({ params }: CategoriesPageProps) {
  // The store is only known per request: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <CategoriesResolver params={params} />
    </Suspense>
  );
}

async function CategoriesResolver({ params }: CategoriesPageProps) {
  const locale = await readLocale(params);
  const { store: segment } = await params;
  const slug = requireStoreSegment(segment);
  const { admin } = getDictionary(locale);
  const me = await requireAdmin(
    storeSectionPath(slug, "categories", locale),
    locale
  );
  const store = requireAdminStore(me, slug);
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state.
  await queryClient
    .query(orpc.category.list.queryOptions({ input: { storeSlug: slug } }))
    .catch(noop);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      location={{ kind: "store", section: "categories", store }}
      role={me.role}
      stores={me.stores}
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CategoryManager storeSlug={slug} />
      </HydrationBoundary>
    </AdminShell>
  );
}
