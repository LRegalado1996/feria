import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminPlaceholder } from "@/app/_components/molecules/admin-placeholder";
import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import { isPlatformSection, platformSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";

interface PlatformSectionProps {
  params: Promise<{ locale: string; section: string }>;
}

/**
 * A section of the platform area (stores FER-014, users FER-015, metrics
 * FER-030), a superadmin's only: a member gets the same 404 as for a page
 * that does not exist, so the area is not even confirmed to them.
 */
export default function PlatformSection({ params }: PlatformSectionProps) {
  // The section is only known per request: the params are read inside the
  // boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <PlatformSectionResolver params={params} />
    </Suspense>
  );
}

async function PlatformSectionResolver({ params }: PlatformSectionProps) {
  const locale = await readLocale(params);
  const { section } = await params;

  if (!isPlatformSection(section)) {
    notFound();
  }

  const { admin } = getDictionary(locale);
  const me = await requireAdmin(platformSectionPath(section, locale), locale);

  if (me.role !== "superadmin") {
    notFound();
  }

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      location={{ kind: "platform", section }}
      role={me.role}
      stores={me.stores}
    >
      <AdminPlaceholder
        body={admin.comingSoon.body}
        status={admin.comingSoon.title}
        title={admin.platformSections[section]}
      />
    </AdminShell>
  );
}
