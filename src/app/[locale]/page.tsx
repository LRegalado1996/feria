import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { getDefaultStore } from "@/server/cache/store";

interface HomeProps {
  params: Promise<{ locale: string }>;
}

/**
 * The site's root opens the default store (FER-013), in the language of the
 * address. The shell is static, once per language; which store is the
 * default is in the database, so that read waits for a request inside the
 * boundary (docs/agents/nextjs.md § Layouts and pages).
 */
export default async function Home({ params }: HomeProps) {
  const locale = await readLocale(params);

  return (
    <Suspense
      fallback={<HomeSkeleton label={getDictionary(locale).common.loading} />}
    >
      <HomeRedirect locale={locale} />
    </Suspense>
  );
}

/** Nothing of the destination is known yet, so the fallback draws nothing. */
function HomeSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="min-h-screen" data-testid="home-skeleton">
      <output className="sr-only">{label}</output>
    </div>
  );
}

export async function HomeRedirect({
  locale,
}: {
  locale: Locale;
}): Promise<null> {
  // The build has no database: without this the cached read below would run
  // while the shell is prerendered.
  await connection();
  const store = await getDefaultStore();

  if (!store) {
    notFound();
  }

  redirect(localizePath(`/${store.slug}`, locale));
}
