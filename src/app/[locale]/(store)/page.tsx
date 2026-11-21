import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { JsonLd } from "@/app/_components/atoms/json-ld";
import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { StoreHome } from "@/app/_components/organisms/store-home";
import { getDictionary } from "@/content";
import { ALL_ARTICLES_PATH } from "@/lib/catalog/paths";
import type { Locale } from "@/lib/i18n/config";
import { buildAlternates } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { pickTranslation } from "@/lib/i18n/pick-translation";
import { readLocale } from "@/lib/i18n/read-locale";
import type { PageContent } from "@/lib/page/content";
import { absoluteUrl } from "@/lib/seo/origin";
import { storeMetadata } from "@/lib/seo/store-metadata";
import {
  STORE_LOGO_PATH,
  storeOrganization,
  webSite,
} from "@/lib/seo/structured-data";
import {
  readHomePage,
  readHomePageId,
  readPageContent,
} from "@/server/cache/page";
import { readStore } from "@/server/cache/store";
import type { ProductCard } from "@/server/services/catalog";
import type { PublicStore } from "@/server/services/store";

import { sectionLists } from "./section-lists";
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

  // The page the store chose as its home may have texts of its own for
  // search engines (FER-060); without them, the store's.
  const home = await readHomePage(store, locale);
  const shared = storeMetadata(store, locale);

  return {
    ...shared,
    alternates: buildAlternates("/", locale),
    description:
      home?.seoDescription ??
      pickTranslation(store.translations, locale)?.description,
    // A share card says what search engines read when the home has its own
    // words, as any page's does; else the store's tagline.
    openGraph:
      home?.seoDescription == null
        ? shared.openGraph
        : { ...shared.openGraph, description: home.seoDescription },
    // The home is the store itself: no "· Store" after its own name.
    title: { absolute: home?.seoTitle ?? store.name },
  };
}

/**
 * What the home tells search engines and assistants (FER-022): the site and
 * the store behind it, and each row (and each article in the spotlight) as
 * a list of its articles, named as on the page, in its order there.
 */
function homeStructuredData(
  store: PublicStore,
  content: PageContent<ProductCard>,
  locale: Locale
) {
  const home = absoluteUrl(localizePath("/", locale));

  return [
    webSite({ locale, name: store.name, url: home }),
    storeOrganization({
      instagramUrl: store.instagramUrl,
      logoUrl: absoluteUrl(STORE_LOGO_PATH),
      name: store.name,
      tiktokUrl: store.tiktokUrl,
      url: home,
    }),
    ...sectionLists(content, locale),
  ];
}

/**
 * The site's home, the store's (FER-038, FER-022): the page the store
 * chose as its home (FER-058), its cover, then the rows of articles and
 * the banners between them, as curated in the admin (FER-020); a store with
 * nothing to show yet introduces itself. The store
 * and its home are read per request, from the cache, before anything is
 * sent, so every section and the footer sit behind no boundary: the first
 * response holds them, for a crawler that runs no script.
 */
export default async function StoreHomePage({ params }: StoreHomeProps) {
  const locale = await readLocale(params);
  // The build has no database: the store is read once a request is there.
  await connection();
  const store = await readStore();

  // Only a database whose migrations have not run has no store.
  if (!store) {
    notFound();
  }

  const { storefront } = getDictionary(locale);
  const [shell, content] = await Promise.all([
    shellOf(store, locale),
    readHomePageId(store).then(
      async (pageId) => await readPageContent(store, pageId, locale)
    ),
  ]);

  return (
    <StoreFrame copy={storefront.shell} locale={locale} {...shell}>
      <main data-slot="store-home-page" data-testid="store-home">
        <JsonLd data={homeStructuredData(store, content, locale)} />
        <StoreHome
          browse={{
            href: localizePath(ALL_ARTICLES_PATH, locale),
            label: storefront.home.browse,
          }}
          content={content}
          copy={storefront}
          locale={locale}
          name={store.name}
          text={pickTranslation(store.translations, locale)}
        />
      </main>
      <StorePageFooter locale={locale} store={store} />
    </StoreFrame>
  );
}
