import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { JsonLd } from "@/app/_components/atoms/json-ld";
import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { StorePage } from "@/app/_components/organisms/store-page";
import { getDictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { buildAlternates } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { absoluteUrl } from "@/lib/seo/origin";
import { defaultShareImage } from "@/lib/seo/share-card";
import { storeTitle } from "@/lib/seo/store-metadata";
import { breadcrumbList } from "@/lib/seo/structured-data";
import { isAdminRequest } from "@/server/better-auth/admin-request";
import { readPageContent, readStorePage } from "@/server/cache/page";
import { readStore } from "@/server/cache/store";

import { sectionLists } from "./section-lists";
import { StorePageFooter } from "./store-page-footer";
import { shellOf } from "./store-shell";

/** A one-segment address of the store: a page's, a group's or a category's. */
export interface StorePageRouteProps {
  params: Promise<{ group: string; locale: string }>;
}

/**
 * The store's page at `/<slug>` (FER-060), read once per request (the
 * metadata and the page share it), or `null` when the address is not a
 * page the visitor may see, for the catalog to answer: no page there, or a
 * draft and the visitor is not a signed-in admin, who previews it. The
 * page that is the home is not a second copy of `/`: its address leads
 * there.
 */
const loadStorePage = cache(async (locale: Locale, slug: string) => {
  await connection();
  const store = await readStore();

  // Only a database whose migrations have not run has no store.
  if (!store) {
    return null;
  }

  const found = await readStorePage(store, slug, locale);

  if (!found) {
    return null;
  }

  if (found.isHome) {
    redirect(localizePath("/", locale));
  }

  const draft = !found.isPublished;

  if (draft && !(await isAdminRequest(await headers()))) {
    return null;
  }

  return { draft, page: found, store };
});

/** The page at the route's address, or `null` for the catalog's turn. */
export async function resolveStorePage({ params }: StorePageRouteProps) {
  const locale = await readLocale(params);
  const { group } = await params;
  const loaded = await loadStorePage(locale, group);

  return loaded ? { ...loaded, locale } : null;
}

type LoadedPage = NonNullable<Awaited<ReturnType<typeof resolveStorePage>>>;

/**
 * A page's title, description, canonical address and `hreflang`: its own
 * texts for search engines, else its name and words made from it, as a
 * category page's are (FER-043). A draft previewed is never indexed.
 */
export function storePageMetadata({
  draft,
  locale,
  page,
  store,
}: LoadedPage): Metadata {
  const description =
    page.seoDescription ??
    interpolate(getDictionary(locale).storefront.page.description, {
      name: page.name,
      store: store.name,
    });
  const title = page.seoTitle ?? storeTitle(page.name, store.name);

  return {
    alternates: buildAlternates(`/${page.slug}`, locale),
    description,
    openGraph: {
      description,
      // A page has no picture of its own to share: the brand's card.
      images: [defaultShareImage(locale)],
      siteName: store.name,
      title,
      type: "website",
    },
    ...(draft ? { robots: { follow: false, index: false } } : {}),
    title: { absolute: title },
  };
}

/**
 * A page of the store (FER-060) in the store's frame: its cover and blocks
 * as the home draws them, its name the page's `h1`, and its structured
 * data: the trail from the home and each block's list. Everything is read
 * before anything is sent, behind no boundary, so a crawler that runs no
 * script reads it all.
 */
export async function StorePageView({
  draft,
  locale,
  page,
  store,
}: LoadedPage) {
  const { storefront } = getDictionary(locale);
  const path = `/${page.slug}`;
  const [shell, content] = await Promise.all([
    shellOf(store, locale),
    readPageContent(store, page.id, locale),
  ]);

  return (
    <StoreFrame
      copy={storefront.shell}
      currentPath={path}
      locale={locale}
      {...shell}
    >
      <main data-slot="store-page-route" data-testid="store-page">
        <JsonLd
          data={[
            breadcrumbList([
              {
                name: storefront.catalog.home,
                url: absoluteUrl(localizePath("/", locale)),
              },
              {
                name: page.name,
                url: absoluteUrl(localizePath(path, locale)),
              },
            ]),
            ...sectionLists(content, locale),
          ]}
        />
        <StorePage
          content={content}
          copy={storefront}
          draft={draft}
          locale={locale}
          name={page.name}
          nameLang={page.lang}
        />
      </main>
      <StorePageFooter locale={locale} store={store} />
    </StoreFrame>
  );
}
