import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { PageManager } from "@/app/_components/organisms/page-manager";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { adminSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";

interface PagesPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * The store's pages (FER-060), the home among them, behind the admin's
 * per-page check: a session. The list is fetched on the server so the screen opens with it.
 */
export default function PagesPage({ params }: PagesPageProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <PagesResolver params={params} />
    </Suspense>
  );
}

async function PagesResolver({ params }: PagesPageProps) {
  const locale = await readLocale(params);
  const { admin } = getDictionary(locale);
  const login = await requireAdmin(adminSectionPath("pages", locale), locale);
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state.
  await queryClient.query(orpc.page.list.queryOptions()).catch(noop);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="pages"
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PageManager />
      </HydrationBoundary>
    </AdminShell>
  );
}
