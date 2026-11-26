"use client";

import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { StoreNotFound as StoreNotFoundPage } from "@/app/_components/organisms/store-not-found";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";

/**
 * An address the site does not answer (an article gone, an old link, a
 * typo), in the store's frame, with the catalog as its way on (FER-069).
 * A client component: `not-found` receives no params, and the language
 * comes from the provider the root layout mounted around it. It reads
 * nothing of the store, so its frame has no bar and its header links to
 * the catalog alone.
 */
export default function StoreNotFound() {
  const { shell } = useDictionary().storefront;
  const copy = shell.notFound;
  const locale = useLocale();

  return (
    <>
      <title>{copy.title}</title>
      <StoreFrame copy={shell} locale={locale}>
        <StoreNotFoundPage
          catalogHref={localizePath(ALL_ARTICLES_PATH, locale)}
          copy={copy}
          homeHref={localizePath("/", locale)}
        />
      </StoreFrame>
    </>
  );
}
