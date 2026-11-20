import { notFound, redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { requireAdmin } from "@/lib/admin/access";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { readHomePageId } from "@/server/cache/page";
import { readStore } from "@/server/cache/store";

interface HomeShortcutProps {
  params: Promise<{ locale: string }>;
}

/**
 * `/admin/home`: a short way to the editor of the page the store shows at
 * `/` (FER-060), whichever it is now. Behind the admin's check like every
 * admin page, so a visitor is sent to sign in, not told which page it is.
 */
export default function HomeShortcut({ params }: HomeShortcutProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <HomeShortcutResolver params={params} />
    </Suspense>
  );
}

async function HomeShortcutResolver({
  params,
}: HomeShortcutProps): Promise<ReactNode> {
  const locale = await readLocale(params);
  await requireAdmin(localizePath("/admin/home", locale), locale);
  const store = await readStore();

  // Only a database whose migrations have not run has no store.
  if (!store) {
    notFound();
  }

  const pageId = await readHomePageId(store);
  redirect(localizePath(`/admin/pages/${String(pageId)}`, locale));
}
