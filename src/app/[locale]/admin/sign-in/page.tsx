import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Skeleton } from "@/app/_components/atoms/skeleton";
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
 * The admin's sign-in (FER-013). The form is the template's, without its
 * sign-up mode; it lands where `?next=` points, when that is an admin page
 * of this site, or the admin's landing; a login that is already signed in
 * goes there at once. The query string is a request-time
 * read, so the form waits inside its boundary; the heading does not.
 */
export default async function SignInPage({
  params,
  searchParams,
}: SignInPageProps) {
  const locale = await readLocale(params);
  const { admin, common } = getDictionary(locale);

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-12"
      data-testid="admin-sign-in"
    >
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold">{admin.signIn.title}</h1>
        <p className="text-sm text-muted-foreground">{admin.signIn.subtitle}</p>
      </div>
      <Suspense fallback={<SignInFormSkeleton label={common.loading} />}>
        <SignInForm locale={locale} searchParams={searchParams} />
      </Suspense>
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
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-full" />
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
