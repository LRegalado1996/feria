import type { ReactNode } from "react";

import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { AdminNav } from "@/app/_components/molecules/admin-nav";
import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { OrdersPendingBadge } from "@/app/_components/molecules/orders-pending-badge";
import { SignOutButton } from "@/app/_components/molecules/sign-out-button";
import { ThemeToggle } from "@/app/_components/molecules/theme-toggle";
import type { Dictionary } from "@/content";
import {
  ADMIN_SECTIONS,
  ADMIN_SIGN_IN,
  type AdminSection,
  adminSectionPath,
} from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";

export interface AdminShellProps {
  children: ReactNode;
  dictionary: Dictionary["admin"];
  locale: Locale;
  /** The section the page belongs to, marked in the navigation. */
  section: AdminSection;
}

/**
 * The admin's chrome (FER-013): a header with the language and theme toggles
 * and sign-out, then the sections, the same list for every login, since every
 * login is an admin (FER-038). Rendered by each page after it has checked the
 * session: the navigation is never the authorization, the page and the
 * procedures are.
 */
function AdminShell({
  children,
  dictionary,
  locale,
  section: current,
}: AdminShellProps) {
  return (
    <div
      className="min-h-dvh"
      data-slot="admin-shell"
      data-testid="admin-shell"
    >
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-20 focus:rounded-md focus:bg-background focus:px-3 focus:py-2"
        href="#admin-main"
      >
        {dictionary.shell.skipToContent}
      </a>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
        <StoreLogo className="h-8 shrink-0" variant="mark" />
        <div className="ml-auto flex items-center gap-1">
          <LocaleToggle />
          <ThemeToggle />
          <SignOutButton redirectTo={ADMIN_SIGN_IN} />
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 md:py-8">
        <div className="flex min-w-0 flex-col gap-2 md:gap-6">
          <AdminNav
            items={ADMIN_SECTIONS.map((section) => ({
              // The orders still to pack, wherever in the admin the staff
              // is: the orders screen is where a new one is announced.
              badge:
                section === "orders" ? (
                  <OrdersPendingBadge
                    label={dictionary.storeSections[section]}
                  />
                ) : undefined,
              current: section === current,
              href: adminSectionPath(section, locale),
              label: dictionary.storeSections[section],
            }))}
            label={dictionary.shell.navigation}
          />
        </div>
        <main className="min-w-0" id="admin-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

export { AdminShell };
