import { dehydrate, HydrationBoundary, noop } from "@tanstack/react-query";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { UserManager } from "@/app/_components/organisms/user-manager";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { adminSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { getQueryClient, orpc } from "@/lib/orpc/server";

interface UsersPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * The store's logins (FER-015), behind the admin's per-page check: a
 * session whose login has chosen its own password. The list is fetched on
 * the server so the screen opens with it.
 */
export default function UsersPage({ params }: UsersPageProps) {
  // The session is a request-time read: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <UsersResolver params={params} />
    </Suspense>
  );
}

async function UsersResolver({ params }: UsersPageProps) {
  const locale = await readLocale(params);
  const { admin } = getDictionary(locale);
  const login = await requireAdmin(adminSectionPath("users", locale), locale);
  const queryClient = getQueryClient();

  // A failed prefetch is not fatal: the screen fetches again and shows its
  // own error state.
  await queryClient.query(orpc.user.list.queryOptions()).catch(noop);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section="users"
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <UserManager currentEmail={login.email} />
      </HydrationBoundary>
    </AdminShell>
  );
}
