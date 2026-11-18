import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { SettingsManager } from "@/app/_components/organisms/settings-manager";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { adminSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";

interface SettingsPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * The company's settings (FER-014), behind the admin's per-page check: a
 * session. The store is fetched on the server so the form opens filled.
 */
export default function SettingsPage({ params }: SettingsPageProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <SettingsResolver params={params} />
    </Suspense>
  );
}

async function SettingsResolver({ params }: SettingsPageProps) {
  const locale = await readLocale(params);
  const { admin } = getDictionary(locale);
  const login = await requireAdmin(
    adminSectionPath("settings", locale),
    locale
  );
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state.
  await queryClient.query(orpc.store.get.queryOptions()).catch(noop);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="settings"
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <SettingsManager />
      </HydrationBoundary>
    </AdminShell>
  );
}
