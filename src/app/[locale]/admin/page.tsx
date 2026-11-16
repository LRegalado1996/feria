import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminShellSkeleton } from "@/app/_components/molecules/admin-shell-skeleton";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import { AdminShell } from "@/app/_components/organisms/admin-shell";
import { getDictionary } from "@/content";
import { requireAdmin } from "@/lib/admin/access";
import {
  ADMIN_HOME,
  platformSectionPath,
  storeSectionPath,
} from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";

interface AdminHomeProps {
  params: Promise<{ locale: string }>;
}

/**
 * Where a signed-in login lands (FER-013): a superadmin in the platform
 * area, a member of one store in that store, a member of several on a
 * choice of stores, and a member of none on a page that says so.
 */
export default async function AdminHome({ params }: AdminHomeProps) {
  const locale = await readLocale(params);

  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AdminLanding locale={locale} />
    </Suspense>
  );
}

async function AdminLanding({ locale }: { locale: Locale }) {
  const { admin } = getDictionary(locale);
  const me = await requireAdmin(localizePath(ADMIN_HOME, locale), locale);
  const [onlyStore] = me.stores;

  if (me.role === "superadmin") {
    redirect(platformSectionPath("stores", locale));
  }

  if (me.stores.length === 1 && onlyStore) {
    redirect(storeSectionPath(onlyStore.slug, "products", locale));
  }

  return (
    <AdminShell
      dictionary={admin}
      locale={locale}
      location={{ kind: "landing" }}
      role={me.role}
      stores={me.stores}
    >
      {me.stores.length === 0 ? (
        <section className="space-y-2" data-testid="admin-no-stores">
          <h1 className="text-2xl font-bold">{admin.landing.noStoresTitle}</h1>
          <EmptyState message={admin.landing.noStoresBody} />
        </section>
      ) : (
        <section className="space-y-4" data-testid="admin-store-picker">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">{admin.landing.pickTitle}</h1>
            <p className="text-sm text-muted-foreground">
              {admin.landing.pickBody}
            </p>
          </div>
          <ul className="grid max-w-md gap-2">
            {me.stores.map((store) => (
              <li key={store.slug}>
                <Link
                  className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                  href={storeSectionPath(store.slug, "products", locale)}
                >
                  <span className="truncate">{store.name}</span>
                  {store.isActive ? null : (
                    <span className="text-xs font-normal text-muted-foreground">
                      {admin.landing.inactive}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AdminShell>
  );
}
