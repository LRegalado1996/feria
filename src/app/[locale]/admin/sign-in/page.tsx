import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/app/_components/atoms/skeleton";
import { StoreLogo } from "@/app/_components/atoms/store-logo";
import { LocaleToggle } from "@/app/_components/molecules/locale-toggle";
import { ThemeToggle } from "@/app/_components/molecules/theme-toggle";
import { AuthForm } from "@/app/_components/organisms/auth-form";
import { getDictionary } from "@/content";
import { safeReturnPath } from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { readLocale } from "@/lib/i18n/read-locale";
import { getSession } from "@/server/better-auth/server";

interface SignInPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}

/**
 * The admin's sign-in (FER-013), on the admin's grey canvas (FER-040): the
 * full logo, the form in a card, and the language and theme the admin's
 * sections offer at their foot. The form is the template's, without its
 * sign-up mode; it lands where `?next=` points, when that is an admin page
 * of this site, or the admin's landing; a login that is already signed in
 * goes there at once. The query string is a request-time read, so the form
 * waits inside its boundary; the heading does not.
 */
export default async function SignInPage({
  params,
  searchParams,
}: SignInPageProps) {
  const locale = await readLocale(params);
  const { admin, common } = getDictionary(locale);

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-sidebar px-4 py-12 text-sidebar-foreground"
      data-testid="admin-sign-in"
    >
      {/* At its minimum size; the gap below is the quarter of its height
          the brand keeps clear (docs/brand/brand.md). */}
      <StoreLogo className="h-24" variant="full" />
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6 text-card-foreground">
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold">{admin.signIn.title}</h1>
          <p className="text-sm text-muted-foreground">
            {admin.signIn.subtitle}
          </p>
        </div>
        <Suspense fallback={<SignInFormSkeleton label={common.loading} />}>
          <SignInForm locale={locale} searchParams={searchParams} />
        </Suspense>
      </div>
      <div className="flex items-center gap-2">
        <LocaleToggle />
        <ThemeToggle />
      </div>
    </main>
  );
}

/** The form's geometry while the page reads the query and the session. */
function SignInFormSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="space-y-4" data-testid="sign-in-skeleton">
      <output className="sr-only">{label}</output>
      {["email", "password"].map((field) => (
        <div className="space-y-2" key={field}>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-11 w-full md:h-9" />
        </div>
      ))}
      <Skeleton className="h-11 w-full md:h-9" />
    </div>
  );
}

async function SignInForm({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: SignInPageProps["searchParams"];
}) {
  const { next } = await searchParams;
  const redirectTo = safeReturnPath(next, locale);

  // Already signed in: straight on, instead of a second session.
  if (await getSession()) {
    redirect(redirectTo);
  }

  return <AuthForm redirectTo={redirectTo} />;
}
