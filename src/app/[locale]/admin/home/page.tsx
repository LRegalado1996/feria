import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { HomeCuration } from "@/app/_components/organisms/home-curation";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { adminSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";
import { readHomePageId } from "@/server/cache/page";
import { readStore } from "@/server/cache/store";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

/**
 * `/admin/home`: the home's curation (FER-020), the editor of the page the
 * store shows at `/` (FER-058), behind the admin's per-page check (a
 * session). The curation is fetched on the server so the screen opens with
 * its forms filled.
 */
export default function HomePage({ params }: HomePageProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <HomeResolver params={params} />
    </Suspense>
  );
}

async function HomeResolver({ params }: HomePageProps) {
  const locale = await readLocale(params);
  const { admin } = getDictionary(locale);
  const login = await requireAdmin(adminSectionPath("home", locale), locale);
  const store = await readStore();

  // Only a database whose migrations have not run has no store.
  if (!store) {
    notFound();
  }

  const pageId = await readHomePageId(store);
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state.
  await queryClient
    .query(orpc.page.get.queryOptions({ input: { pageId } }))
    .catch(noop);

  return (
    <AdminShell dictionary={admin} locale={locale} login={login} section="home">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <HomeCuration pageId={pageId} />
      </HydrationBoundary>
    </AdminShell>
  );
}
