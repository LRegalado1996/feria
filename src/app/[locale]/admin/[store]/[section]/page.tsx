import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminPlaceholder } from "@/app/_components/molecules/admin-placeholder";
import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { getDictionary } from "@/content";
import {
  requireAdmin,
  requireAdminStore,
  requireStoreSegment,
} from "@/lib/admin/access";
import { isStoreSection, storeSectionPath } from "@/lib/admin/paths";
import { readLocale } from "@/lib/i18n/read-locale";

interface StoreSectionProps {
  params: Promise<{ locale: string; section: string; store: string }>;
}

/**
 * A section of a store's admin. Until its own page lands (articles FER-019,
 * orders FER-027, home FER-020, settings FER-014, users FER-015) it says it
 * is coming, behind the same checks the real page will have: a session, and
 * a store the login may work on (another store's is a 404).
 */
export default function StoreSection({ params }: StoreSectionProps) {
  // The store and the section are only known per request: the params are
  // read inside the boundary, never above it.
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <StoreSectionResolver params={params} />
    </Suspense>
  );
}

async function StoreSectionResolver({ params }: StoreSectionProps) {
  const locale = await readLocale(params);
  const { section, store: segment } = await params;

  if (!isStoreSection(section)) {
    notFound();
  }

  const slug = requireStoreSegment(segment);
  const { admin } = getDictionary(locale);
  const me = await requireAdmin(
    storeSectionPath(slug, section, locale),
    locale
  );
  const store = requireAdminStore(me, slug);

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      location={{ kind: "store", section, store }}
      role={me.role}
      stores={me.stores}
    >
      <AdminPlaceholder
        body={admin.comingSoon.body}
        status={admin.comingSoon.title}
        title={admin.storeSections[section]}
      />
    </AdminShell>
  );
}
