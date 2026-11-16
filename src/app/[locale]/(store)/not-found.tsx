"use client";

import { StoreArrowLink } from "@/app/_components/atoms/store-arrow-link";
import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { StoreStatusPage } from "@/app/_components/organisms/store-status-page";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";

/**
 * An address the site does not answer (an article gone, an old link, a
 * typo), in the store's frame, with the way back to its home. A client
 * component: `not-found` receives no params, and the language comes from the
 * provider the root layout mounted around it. It reads nothing of the store,
 * so its frame has no bar and its header links to the catalog alone.
 */
export default function StoreNotFound() {
  const { shell } = useDictionary().storefront;
  const copy = shell.notFound;
  const locale = useLocale();

  return (
    <>
      <title>{copy.title}</title>
      <StoreFrame copy={shell} locale={locale}>
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
      </StoreFrame>
    </>
  );
}
