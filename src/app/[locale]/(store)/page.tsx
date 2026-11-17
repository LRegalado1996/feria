import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { StoreIntro } from "@/app/_components/organisms/store-intro";
import { getDictionary } from "@/content";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import { buildAlternates } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import { storeMetadata } from "@/lib/seo/store-metadata";
import { readStore } from "@/server/cache/store";

import { StorePageFooter } from "./store-page-footer";
import { shellOf } from "./store-shell";

// The home waits for the store before anything is sent, by design: a crawler
// that runs no script must find it in the HTML, and React writes a boundary's
// content in place only while the first response stays under 12,800 bytes,
// which the frame alone nearly fills (docs/agents/nextjs.md § Store pages).
// This tells Next's instant-navigation check that the wait is intended.
export const instant = false;

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
 * home's real sections are FER-022. The store is read per request, from the
 * cache, before anything is sent, so the intro and the footer sit behind no
 * boundary: the first response holds them.
 */
export default async function StoreHome({ params }: StoreHomeProps) {
  const locale = await readLocale(params);
  // The build has no database: the store is read once a request is there.
  await connection();
  const store = await readStore();

  // Only a database whose migrations have not run has no store.
  if (!store) {
    notFound();
  }

  const { storefront } = getDictionary(locale);

  return (
    <StoreFrame
      copy={storefront.shell}
      locale={locale}
      {...await shellOf(store, locale)}
    >
      <main data-slot="store-home" data-testid="store-home">
        <StoreIntro
          browse={{
            href: localizePath(ALL_ARTICLES_PATH, locale),
            label: storefront.home.browse,
          }}
          name={store.name}
          text={pickTranslation(store.translations, locale)}
        />
      </main>
      <StorePageFooter locale={locale} store={store} />
    </StoreFrame>
  );
}
