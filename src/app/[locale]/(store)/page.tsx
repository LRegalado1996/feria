import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { StoreIntro } from "@/app/_components/organisms/store-intro";
import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { buildAlternates } from "@/lib/i18n/metadata";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import { storeMetadata } from "@/lib/seo/store-metadata";
import { readStore } from "@/server/cache/store";

import { StorePageFooter } from "./store-page-footer";

interface StoreHomeProps {
  params: Promise<{ locale: string }>;
}

/**
 * The home's title is the store's name and its description the store's own.
 * Read at request time like the page: the build has no database.
 */
export async function generateMetadata({
  params,
}: StoreHomeProps): Promise<Metadata> {
  const locale = await readLocale(params);
  await connection();
  const store = await readStore();

  if (!store) {
    return {};
  }

  return {
    ...storeMetadata(store, locale),
    alternates: buildAlternates("/", locale),
    description: pickTranslation(store.translations, locale)?.description,
    // The home is the store itself: no "· Store" after its own name.
    title: { absolute: store.name },
  };
}

/**
 * The site's home, the store's (FER-038). For now it introduces the store:
 * its name, and its tagline and description in the language of the URL; the
 * home's real sections are FER-022. The store is read per request, from
 * the cache, behind a boundary: the shell around it (the header) is
 * prerendered with the build, which has no database.
 */
export default async function StoreHome({ params }: StoreHomeProps) {
  const locale = await readLocale(params);

  return (
    <Suspense
      fallback={<HomeSkeleton label={getDictionary(locale).common.loading} />}
    >
      <StoreHomeContent locale={locale} />
    </Suspense>
  );
}

/** Nothing of the store is known yet, so the fallback draws an empty home. */
function HomeSkeleton({ label }: { label: string }) {
  return (
    <main aria-busy="true" className="flex-1" data-testid="store-home-skeleton">
      <output className="sr-only">{label}</output>
    </main>
  );
}

export async function StoreHomeContent({ locale }: { locale: Locale }) {
  await connection();
  const store = await readStore();

  // Only a database whose migrations have not run has no store.
  if (!store) {
    notFound();
  }

  return (
    <>
      <main data-slot="store-home" data-testid="store-home">
        <StoreIntro
          name={store.name}
          text={pickTranslation(store.translations, locale)}
        />
      </main>
      <StorePageFooter locale={locale} store={store} />
    </>
  );
}
