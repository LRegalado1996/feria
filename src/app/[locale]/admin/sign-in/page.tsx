import { Suspense } from "react";

import { AuthForm } from "@/app/_components/organisms/auth-form";
import { getDictionary } from "@/content";
import { safeReturnPath } from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { readLocale } from "@/lib/i18n/read-locale";

interface SignInPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}

/**
 * The admin's sign-in (FER-013). The form is the template's, without its
 * sign-up mode; it lands where `?next=` points, when that is an admin page
 * of this site, or the admin's landing. The query string is a request-time
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
      <Suspense
        fallback={
          <div aria-busy="true" className="h-64" title={common.loading} />
        }
      >
        <SignInForm locale={locale} searchParams={searchParams} />
      </Suspense>
    </main>
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

  return <AuthForm redirectTo={safeReturnPath(next, locale)} />;
}
