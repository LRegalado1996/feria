import { Suspense } from "react";

import { AdminPlaceholder } from "@/app/_components/molecules/admin-placeholder";
import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { type AdminSection, adminSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";

/** The sections whose screen is still to come. */
export type PlaceholderSection = Extract<
  AdminSection,
  "home" | "metrics" | "products" | "settings" | "users"
>;

interface AdminSectionPlaceholderProps {
  params: Promise<{ locale: string }>;
  section: PlaceholderSection;
}

/**
 * A section of the admin whose screen is still to come: it says so, behind
 * the check the real page will have (a session). Each section is a static
 * folder that renders this, not a `[section]` segment, so any other address
 * under `/admin` reaches the catch-all and its real 404.
 */
export function AdminSectionPlaceholder({
  params,
  section,
}: AdminSectionPlaceholderProps) {
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AdminSectionPlaceholderResolver params={params} section={section} />
    </Suspense>
  );
}

export async function AdminSectionPlaceholderResolver({
  params,
  section,
}: AdminSectionPlaceholderProps) {
  const locale = await readLocale(params);
  const { admin } = getDictionary(locale);
  const login = await requireAdmin(adminSectionPath(section, locale), locale);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      login={login}
      section={section}
    >
      <AdminPlaceholder
        body={admin.comingSoon.body}
        status={admin.comingSoon.title}
        title={admin.storeSections[section]}
      />
    </AdminShell>
  );
}
