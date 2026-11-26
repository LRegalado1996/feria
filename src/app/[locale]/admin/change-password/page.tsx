import Link from "next/link";
import { Suspense } from "react";

import { Skeleton } from "@/app/_components/atoms/skeleton";
import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { SignOutButton } from "@/app/_components/molecules/sign-out-button";
import { ThemeToggle } from "@/app/_components/molecules/theme-toggle";
import { ChangePasswordForm } from "@/app/_components/organisms/change-password-form";
import { getDictionary } from "@/content";
import { requireLogin } from "@/lib/admin/access";
import {
  ADMIN_CHANGE_PASSWORD,
  ADMIN_SIGN_IN,
  afterPasswordChangePath,
} from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";

interface ChangePasswordPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}

/**
 * Where a login chooses its own password (FER-015), on the sign-in page's
 * grey canvas: once it signed in with a temporary one an admin gave it
 * (every other admin page sends it here first), or whenever it wants, from
 * the shell's "Cambiar contraseña". Behind a session, like every admin
 * page; it lands where `?next=` points once saved, when that is an admin
 * page of this site other than this one. A login still on the temporary password can only sign
 * out from here; one that chose its own can go back.
 */
export default async function ChangePasswordPage({
  params,
  searchParams,
}: ChangePasswordPageProps) {
  const locale = await readLocale(params);
  const { common } = getDictionary(locale);

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-sidebar px-4 py-12 text-sidebar-foreground"
      data-testid="admin-change-password"
    >
      {/* At its minimum size; the gap below is the quarter of its height
          the brand keeps clear (docs/brand/brand.md). */}
      <StoreLogo className="h-24" variant="full" />
      <Suspense fallback={<ChangePasswordSkeleton label={common.loading} />}>
        <ChangePasswordCard locale={locale} searchParams={searchParams} />
      </Suspense>
      <div className="flex items-center gap-2">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </main>
  );
}

/** The card's geometry while the page reads the session. */
function ChangePasswordSkeleton({ label }: { label: string }) {
  return (
    <div
      aria-busy="true"
      className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6"
      data-testid="change-password-skeleton"
    >
      <output className="sr-only">{label}</output>
      <Skeleton className="mx-auto h-6 w-48" />
      {["current", "new", "confirm"].map((field) => (
        <div className="space-y-2" key={field}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 w-full md:h-9" />
        </div>
      ))}
      <Skeleton className="h-11 w-full md:h-9" />
    </div>
  );
}

export async function ChangePasswordCard({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: ChangePasswordPageProps["searchParams"];
}) {
  const { admin } = getDictionary(locale);
  const copy = admin.password;
  const { next } = await searchParams;
  const redirectTo = afterPasswordChangePath(next, locale);
  const here =
    typeof next === "string"
      ? `${localizePath(ADMIN_CHANGE_PASSWORD, locale)}?next=${encodeURIComponent(next)}`
      : localizePath(ADMIN_CHANGE_PASSWORD, locale);
  const login = await requireLogin(here, locale);
  const forced = login.mustChangePassword;

  return (
    <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6 text-card-foreground">
      <div className="space-y-2 text-center">
        <h1 className="text-xl font-semibold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">
          {forced ? copy.forcedSubtitle : copy.subtitle}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {interpolate(copy.signedInAs, { email: login.email })}
        </p>
      </div>
      <ChangePasswordForm forced={forced} redirectTo={redirectTo} />
      {forced ? (
        <SignOutButton className="w-full" redirectTo={ADMIN_SIGN_IN} />
      ) : (
        <Link
          className="block text-center text-sm underline underline-offset-4"
          data-testid="change-password-back"
          href={redirectTo}
        >
          {copy.back}
        </Link>
      )}
    </div>
  );
}
