import {
  ChartColumn,
  Folder,
  Funnel,
  Files,
  KeyRound,
  type LucideIcon,
  Settings,
  ShoppingBag,
  Tag,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/app/_components/atoms/button";
import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { AdminFrame } from "@/app/_components/molecules/admin-frame";
import { AdminMenu } from "@/app/_components/molecules/admin-menu";
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
  changePasswordPath,
} from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";

/** Each section's icon in the navigation, for the eye only. */
const SECTION_ICONS = {
  categories: Folder,
  filters: Funnel,
  pages: Files,
  metrics: ChartColumn,
  orders: ShoppingBag,
  products: Tag,
  settings: Settings,
  users: Users,
} satisfies Record<AdminSection, LucideIcon>;

export interface AdminShellProps {
  children: ReactNode;
  dictionary: Dictionary["admin"];
  locale: Locale;
  /** Who is signed in (`admin.me`), shown at the foot of the sections. */
  login: { email: string; name: string };
  /** The section the page belongs to, marked in the navigation. */
  section: AdminSection;
}

/**
 * The admin's chrome (FER-013, FER-040): the full logo, the sections with
 * their icons and the orders' count, and the signed-in login with the
 * language, the theme, changing its password (FER-015) and sign-out. From
 * `md` up it is a sidebar the height of the window, beside the page on a
 * grey canvas (`molecules/admin-frame`, with the skip link and the main
 * landmark); on a phone the same content opens as a panel from the menu
 * button in the page's top bar
 * (`molecules/admin-page`). The same list for every login, since every
 * login is an admin (FER-038). Rendered by each page after it has checked
 * the session: the navigation is never the authorization, the page and the
 * procedures are.
 */
function AdminShell({
  children,
  dictionary,
  locale,
  login,
  section,
}: AdminShellProps) {
  const sidebar = (
    <AdminSidebar
      dictionary={dictionary}
      locale={locale}
      login={login}
      section={section}
    />
  );

  return (
    <AdminMenu panel={sidebar}>
      <AdminFrame data-testid="admin-shell" sidebar={sidebar}>
        {children}
      </AdminFrame>
    </AdminMenu>
  );
}

/**
 * What the sidebar and the phone's panel both show: the logo, the sections,
 * then the login and its controls at the foot. On a screen too short for all
 * of it (a phone turned sideways) the whole column scrolls as one, so every
 * section and sign-out stay reachable.
 */
function AdminSidebar({
  dictionary,
  locale,
  login,
  section: current,
}: Omit<AdminShellProps, "children">) {
  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-y-auto"
      data-slot="admin-sidebar"
    >
      {/* The full logo at its minimum size, with a quarter of its height
          clear on every side (docs/brand/brand.md). */}
      <div className="shrink-0 p-6">
        <StoreLogo className="h-24" variant="full" />
      </div>
      {/* Grows to put the login at the foot, and never shrinks below its
          links: a scroll box of its own would be squeezed to its padding on
          a short screen, the links clipped inside it. */}
      <AdminNav
        className="flex-1 p-3"
        items={ADMIN_SECTIONS.map((section) => ({
          // The orders still to pack, wherever in the admin the staff is:
          // the orders screen is where a new one is announced.
          badge:
            section === "orders" ? (
              <OrdersPendingBadge
                className="shrink-0"
                label={dictionary.storeSections[section]}
              />
            ) : undefined,
          current: section === current,
          href: adminSectionPath(section, locale),
          icon: SECTION_ICONS[section],
          label: dictionary.storeSections[section],
        }))}
        label={dictionary.shell.navigation}
      />
      <div
        className="shrink-0 space-y-2 border-t border-sidebar-border p-3"
        data-testid="admin-account"
      >
        <div className="min-w-0 px-3 py-1">
          <p className="sr-only">{dictionary.shell.signedInAs}</p>
          <p className="truncate text-sm font-medium">{login.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {login.email}
          </p>
        </div>
        <div className="flex items-center justify-between gap-2 pl-3">
          <LocaleToggle />
          <ThemeToggle />
        </div>
        {/* Back to this section once the new password is saved (FER-015). */}
        <Button asChild className="w-full justify-start" variant="outline">
          <Link
            data-testid="admin-change-password-link"
            href={changePasswordPath(adminSectionPath(current, locale), locale)}
          >
            <KeyRound aria-hidden="true" />
            {dictionary.shell.changePassword}
          </Link>
        </Button>
        <SignOutButton
          className="w-full justify-start"
          redirectTo={ADMIN_SIGN_IN}
        />
      </div>
    </div>
  );
}

export { AdminShell };
