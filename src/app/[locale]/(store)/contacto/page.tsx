import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { JsonLd } from "@/app/_components/atoms/json-ld";
import { StoreContact } from "@/app/_components/organisms/store-contact";
import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { getDictionary } from "@/content";
import { ALL_ARTICLES_PATH, CONTACT_PATH } from "@/lib/catalog/paths";
import { interpolate } from "@/lib/i18n/interpolate";
import { buildAlternates } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { absoluteUrl } from "@/lib/seo/origin";
import { storeTitle } from "@/lib/seo/store-metadata";
import {
  breadcrumbList,
  STORE_LOGO_PATH,
  storeOrganization,
} from "@/lib/seo/structured-data";
import { readStore } from "@/server/cache/store";

import { StorePageFooter, storeLocation } from "../store-page-footer";
import { shellOf } from "../store-shell";

// Like the home, the page waits for the store before anything is sent: its
// whole content is the store's contact details, which a crawler that runs
// no script must find in the HTML (docs/agents/nextjs.md § Store pages).
// This tells Next's instant-navigation check that the wait is intended.
export const instant = false;

interface ContactPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * The contact page's own title and description, in the page's language,
 * with its canonical address and its twin in the other language. Read at
 * request time like the page: the build has no database.
 */
export async function generateMetadata({
  params,
}: ContactPageProps): Promise<Metadata> {
  const locale = await readLocale(params);
  await connection();
  const store = await readStore();
  const copy = getDictionary(locale).storefront.contact;

  if (!store) {
    return { title: copy.title };
  }

  const description = interpolate(copy.description, { store: store.name });

  return {
    alternates: buildAlternates(CONTACT_PATH, locale),
    description,
    openGraph: {
      description,
      siteName: store.name,
      title: copy.title,
      type: "website",
    },
    title: { absolute: storeTitle(copy.title, store.name) },
  };
}

/**
 * The store's contact page (FER-080), at `/contacto` in both languages:
 * how to reach the store, all from its settings (WhatsApp, Instagram,
 * TikTok and where it is, each only when set), and how to buy. A folder of
 * its own, so the router prefers it to a category's one-segment address,
 * and a word no category or page can take (`RESERVED_CATEGORY_SLUGS`).
 * The store is read per request, from the cache, before anything is sent:
 * the page and its footer sit behind no boundary.
 */
export default async function ContactPage({ params }: ContactPageProps) {
  const locale = await readLocale(params);
  // The build has no database: the store is read once a request is there.
  await connection();
  const store = await readStore();

  // Only a database whose migrations have not run has no store.
  if (!store) {
    notFound();
  }

  const { storefront } = getDictionary(locale);
  const shell = await shellOf(store, locale);
  const home = absoluteUrl(localizePath("/", locale));
  const here = absoluteUrl(localizePath(CONTACT_PATH, locale));

  return (
    <StoreFrame
      copy={storefront.shell}
      currentPath={CONTACT_PATH}
      locale={locale}
      {...shell}
    >
      <main data-slot="store-contact-page" data-testid="store-contact-page">
        <JsonLd
          data={[
            storeOrganization({
              instagramUrl: store.instagramUrl,
              logoUrl: absoluteUrl(STORE_LOGO_PATH),
              name: store.name,
              tiktokUrl: store.tiktokUrl,
              url: home,
              whatsappNumber: store.whatsappNumber,
            }),
            breadcrumbList([
              { name: storefront.shell.home, url: home },
              { name: storefront.contact.title, url: here },
            ]),
          ]}
        />
        <StoreContact
          browseHref={localizePath(ALL_ARTICLES_PATH, locale)}
          copy={storefront}
          location={storeLocation(store, locale)}
          store={store}
        />
      </main>
      <StorePageFooter locale={locale} store={store} />
    </StoreFrame>
  );
}
