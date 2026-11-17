import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { CategoryManager } from "@/app/_components/organisms/category-manager";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { adminSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";

interface CategoriesPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * The store's categories (FER-016), behind the admin's per-page check: a
 * session. The list is fetched on the server so the screen opens with it.
 */
export default function CategoriesPage({ params }: CategoriesPageProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <CategoriesResolver params={params} />
    </Suspense>
  );
}

async function CategoriesResolver({ params }: CategoriesPageProps) {
  const locale = await readLocale(params);
  const { admin } = getDictionary(locale);
  const login = await requireAdmin(
    adminSectionPath("categories", locale),
    locale
  );
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state.
  await queryClient.query(orpc.category.list.queryOptions()).catch(noop);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="categories"
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <CategoryManager />
      </HydrationBoundary>
    </AdminShell>
  );
}
