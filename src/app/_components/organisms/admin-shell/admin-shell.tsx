import type { ReactNode } from "react";

import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { AdminNav } from "@/app/_components/molecules/admin-nav";
import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { OrdersPendingBadge } from "@/app/_components/molecules/orders-pending-badge";
import { SignOutButton } from "@/app/_components/molecules/sign-out-button";
import { StoreSwitcher } from "@/app/_components/molecules/store-switcher";
import { ThemeToggle } from "@/app/_components/molecules/theme-toggle";
import type { Dictionary } from "@/content";
import {
  ADMIN_SIGN_IN,
  PLATFORM_SECTIONS,
  type PlatformSection,
  platformSectionPath,
  STORE_SECTIONS,
  type StoreSection,
  storeSectionPath,
} from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import type { UserRole } from "@/lib/schemas/access";

/** Where in the admin the page is. */
export type AdminLocation =
  | { kind: "landing" }
  | { kind: "platform"; section: PlatformSection }
  | {
      kind: "store";
      section: StoreSection;
      store: { name: string; slug: string };
    };

export interface AdminShellProps {
  children: ReactNode;
  dictionary: Dictionary["admin"];
  locale: Locale;
  location: AdminLocation;
  /** The signed-in login's role, as the database holds it. */
  role: UserRole;
  /** The stores the login may work on, for the switcher. */
  stores: { name: string; slug: string }[];
}

/**
 * The admin's chrome (FER-013): a header with the store switcher, the
 * language and theme toggles and sign-out, then the store's sections and,
 * for a superadmin only, the platform's. Rendered by each page after it has
 * checked the session and the store, from what that check returned: the
 * navigation is never the authorization, the page and the procedures are.
 */
function AdminShell({
  children,
  dictionary,
  locale,
  location,
  role,
  stores,
}: AdminShellProps) {
  const currentStore = location.kind === "store" ? location.store : null;
  // A section that exists in every store is kept when switching; the
  // articles otherwise.
  const switchSection: StoreSection =
    location.kind === "store" ? location.section : "products";
  const storeName = currentStore?.name ?? stores[0]?.name;
  let storeHeading: ReactNode = null;

  if (stores.length > 1 || (role === "superadmin" && stores.length > 0)) {
    storeHeading = (
      <StoreSwitcher
        current={currentStore}
        label={interpolate(dictionary.shell.storeSwitcher, {
          store: currentStore?.name ?? dictionary.shell.stores,
        })}
        stores={stores.map((store) => ({
          href: storeSectionPath(store.slug, switchSection, locale),
          name: store.name,
          slug: store.slug,
        }))}
        title={dictionary.shell.stores}
      />
    );
  } else if (storeName) {
    storeHeading = (
      <p className="truncate px-3 text-sm font-semibold">{storeName}</p>
    );
  }

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
        {/* On a phone the store gets a line of its own under the controls:
            beside them its name would be cut to a few letters. */}
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
          {storeHeading}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <LocaleToggle />
          <ThemeToggle />
          <SignOutButton redirectTo={ADMIN_SIGN_IN} />
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8 md:py-8">
        <div className="flex min-w-0 flex-col gap-2 md:gap-6">
          {currentStore ? (
            <AdminNav
              items={STORE_SECTIONS.map((section) => ({
                // The orders still to pack, wherever in the store the staff
                // is: the orders screen is where a new one is announced.
                badge:
                  section === "orders" ? (
                    <OrdersPendingBadge storeSlug={currentStore.slug} />
                  ) : undefined,
                current:
                  location.kind === "store" && location.section === section,
                href: storeSectionPath(currentStore.slug, section, locale),
                label: dictionary.storeSections[section],
              }))}
              label={dictionary.shell.navigation}
              title={currentStore.name}
            />
          ) : null}
          {role === "superadmin" ? (
            <AdminNav
              items={PLATFORM_SECTIONS.map((section) => ({
                current:
                  location.kind === "platform" && location.section === section,
                href: platformSectionPath(section, locale),
                label: dictionary.platformSections[section],
              }))}
              label={dictionary.shell.platformNavigation}
              title={dictionary.shell.platform}
            />
          ) : null}
        </div>
        <main className="min-w-0" id="admin-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

export { AdminShell };
