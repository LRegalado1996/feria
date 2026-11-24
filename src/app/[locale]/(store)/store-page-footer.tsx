import { connection } from "next/server";
import { Suspense } from "react";

import { StoreFooter } from "@/app/_components/organisms/store-footer";
import { getDictionary } from "@/content";
import type { NavigationCategory } from "@/lib/catalog/navigation";
import type { Locale } from "@/lib/i18n/config";
import { LOCALES } from "@/lib/i18n/config";
import { readCategories } from "@/server/cache/catalog";
import { readStore } from "@/server/cache/store";
import type { PublicStore } from "@/server/services/store";

/**
 * Where to find the store (FER-078), as the footer shows it: the line the
 * admin wrote in the page's language, else the one in the other language,
 * marked with the language it is in; `null` when the store wrote none.
 */
export function storeLocation(
  store: Pick<PublicStore, "translations">,
  locale: Locale
): { lang: Locale; text: string } | null {
  for (const lang of [locale, ...LOCALES.filter((other) => other !== locale)]) {
    const text = store.translations.find(
      (translation) => translation.locale === lang
    )?.location;

    if (text) {
      return { lang, text };
    }
  }

  return null;
}

/**
 * The footer every store page ends with (FER-021, FER-039), from the store
 * the page already read and its categories, a cached read, or the ones the
 * page read itself (a catalog page). Pages render it, not the layout: the
 * layout has no address to wait for, so it is prerendered at build, where
 * there is no database (docs/agents/nextjs.md § Store pages).
 */
export async function StorePageFooter({
  categories,
  locale,
  store,
}: {
  categories?: readonly NavigationCategory[];
  locale: Locale;
  store: PublicStore;
}) {
  const { storefront } = getDictionary(locale);

  return (
    <StoreFooter
      categories={categories ?? (await readCategories(store, locale))}
      // At the bottom of a short page too: the content region is a column.
      className="mt-auto"
      copy={storefront.shell}
      locale={locale}
      location={storeLocation(store, locale)}
      payments={storefront.payments}
      store={store}
    />
  );
}

/**
 * The footer of a page that reads nothing else of the store (the cart): the
 * store is read at request time, behind its own boundary, so the rest of the
 * page stays in the prerendered shell.
 */
export function StreamedStoreFooter({ locale }: { locale: Locale }) {
  return (
    <Suspense fallback={null}>
      <StreamedStoreFooterResolver locale={locale} />
    </Suspense>
  );
}

export async function StreamedStoreFooterResolver({
  locale,
}: {
  locale: Locale;
}) {
  // The build has no database: without this the cached read below would run
  // while the shell is prerendered.
  await connection();
  const store = await readStore();

  return store ? <StorePageFooter locale={locale} store={store} /> : null;
}
