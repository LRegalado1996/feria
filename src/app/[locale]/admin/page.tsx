import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { requireAdmin } from "@/lib/admin/access";
import {
  ADMIN_HOME,
  ADMIN_LANDING_SECTION,
  adminSectionPath,
} from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";

interface AdminHomeProps {
  params: Promise<{ locale: string }>;
}

/**
 * Where a signed-in login lands (FER-013): the orders, as Lucas chose
 * (FER-038). Every login is an admin, so there is nothing to choose; a
 * visitor without a session goes to the sign-in page, which brings them back
 * here.
 */
export default async function AdminHome({ params }: AdminHomeProps) {
  const locale = await readLocale(params);

  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AdminLanding locale={locale} />
    </Suspense>
  );
}

export async function AdminLanding({
  locale,
}: {
  locale: Locale;
}): Promise<null> {
  await requireAdmin(localizePath(ADMIN_HOME, locale), locale);

  redirect(adminSectionPath(ADMIN_LANDING_SECTION, locale));
}
