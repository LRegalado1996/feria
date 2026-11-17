"use client";

import { StoreArrowLink } from "@/app/_components/atoms/store-arrow-link";
import { StoreStatusPage } from "@/app/_components/organisms/store-status-page";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";

/**
 * An address the site does not answer (an article gone, an old link, a
 * typo), under the store's header, with the way back to its home. A client
 * component: `not-found` receives no params, and the language comes from the
 * provider the root layout mounted around it.
 */
export default function StoreNotFound() {
  const copy = useDictionary().storefront.shell.notFound;
  const locale = useLocale();

  return (
    <>
      <title>{copy.title}</title>
      <StoreStatusPage
        action={
          <StoreArrowLink
            data-testid="store-not-found-home"
            href={localizePath("/", locale)}
          >
            {copy.back}
          </StoreArrowLink>
        }
        body={copy.body}
        title={copy.title}
      />
    </>
  );
}
