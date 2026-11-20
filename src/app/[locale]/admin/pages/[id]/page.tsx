import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { PageEditor } from "@/app/_components/organisms/page-editor";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { readRowId } from "@/lib/admin/paths";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";

interface PageEditorPageProps {
  params: Promise<{ id: string; locale: string }>;
}

/**
 * `/admin/pages/<id>`: a page's editor (FER-060; the home's since FER-020):
 * its settings, its cover and blocks in order and a preview, behind the
 * admin's per-page check (a session). The page is fetched on the server so
 * the screen opens with its forms filled; an id that is not one is a 404.
 */
export default function PageEditorPage({ params }: PageEditorPageProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <PageEditorResolver params={params} />
    </Suspense>
  );
}

async function PageEditorResolver({ params }: PageEditorPageProps) {
  const locale = await readLocale(params);
  const { id } = await params;
  const pageId = readRowId(id);

  if (pageId === null) {
    notFound();
  }

  const { admin } = getDictionary(locale);
  const login = await requireAdmin(
    localizePath(`/admin/pages/${String(pageId)}`, locale),
    locale
  );
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state (a page another tab deleted among them).
  await queryClient
    .query(orpc.page.get.queryOptions({ input: { pageId } }))
    .catch(noop);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="pages"
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PageEditor pageId={pageId} />
      </HydrationBoundary>
    </AdminShell>
  );
}
