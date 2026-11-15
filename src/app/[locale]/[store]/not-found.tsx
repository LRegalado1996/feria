"use client";

import { useParams } from "next/navigation";

import { StoreArrowLink } from "@/app/_components/atoms/store-arrow-link";
import { StoreStatusPage } from "@/app/_components/organisms/store-status-page";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";

/**
 * A page of a store that does not exist (an article gone, an old link),
 * inside the store's header and footer, with the way back to its home. A
 * client component: `not-found` receives no params, and the store is the
 * URL's segment. An address that is not a store at all never gets here: the
 * store's layout answers that one with the app's own not-found page.
 */
export default function StoreNotFound() {
  const copy = useDictionary().storefront.shell.notFound;
  const locale = useLocale();
  const { store } = useParams<{ store: string }>();

  return (
    <>
      <title>{copy.title}</title>
      <StoreStatusPage
        action={
          <StoreArrowLink
            data-testid="store-not-found-home"
            href={localizePath(`/${store}`, locale)}
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
