import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { JsonLd } from "@/app/_components/atoms/json-ld";
import { StoreCatalog } from "@/app/_components/organisms/store-catalog";
import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { getDictionary } from "@/content";
import { selectionName } from "@/lib/catalog/heading";
import { navigationOrder } from "@/lib/catalog/navigation";
import { ALL_ARTICLES_PATH, articlePath } from "@/lib/catalog/paths";
import {
  type CatalogQuery,
  catalogHref,
  knownOnly,
  type RawSearchParams,
  rawSearchParams,
  readCatalogCursor,
  readCatalogQuery,
  searchOf,
} from "@/lib/catalog/query";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { readLocale } from "@/lib/i18n/read-locale";
import { caller } from "@/lib/orpc/server";
import { DEFAULT_PRODUCT_SORT } from "@/lib/schemas/catalog";
import { absoluteUrl } from "@/lib/seo/origin";
import { defaultShareImage } from "@/lib/seo/share-card";
import { storeTitle } from "@/lib/seo/store-metadata";
import { breadcrumbList, collectionPage } from "@/lib/seo/structured-data";
import { formatList } from "@/lib/utils/format";
import { readAllArticlesCover, readCategoryPage } from "@/server/cache/catalog";
import { readStore } from "@/server/cache/store";
import type { CategoryPage } from "@/server/services/catalog";
import type { PublicStore } from "@/server/services/store";

import { StorePageFooter } from "./store-page-footer";
import { shellOf } from "./store-shell";

/**
 * A catalog page's address (FER-043): all articles (`/productos`, no
 * slug), a category or a group (`/burbujeros`, `/bijouterie`), or a
 * category under its group (`/bijouterie/anillos`).
 */
export interface CatalogPageProps {
  params: Promise<{ category?: string; group?: string; locale: string }>;
  searchParams: Promise<RawSearchParams>;
}

type CatalogCopy = ReturnType<typeof getDictionary>["storefront"]["catalog"];

/**
 * The page's own words when the admin wrote none: a group names its
 * categories, a category the store; all articles has its own line.
 */
function pageDescription(
  copy: CatalogCopy,
  store: PublicStore,
  page: CategoryPage | null,
  locale: Locale
) {
  if (!page) {
    return interpolate(copy.description, { store: store.name });
  }

  if (page.seoDescription) {
    return page.seoDescription;
  }

  return page.children.length > 0
    ? interpolate(copy.groupDescription, {
        categories: formatList(
          page.children.map((child) => child.name),
          locale
        ),
        name: page.name,
        store: store.name,
      })
    : interpolate(copy.categoryDescription, {
        name: page.name,
        store: store.name,
      });
}

/** Whether the address narrows its page further: a filter or a search. */
function narrowed(query: CatalogQuery) {
  return query.filters.length > 0 || query.q !== null;
}

/**
 * Everything a catalog page shows and says about itself, read once per
 * request (the metadata and the page share it): the page, its articles'
 * first page, its texts, its cover and its trail; or where its category
 * lives now; or nothing, for an address no page has.
 */
const loadCatalogPage = cache(
  async (locale: Locale, slugs: string, search: string) => {
    const store = await readStore();
    const [first, second] = slugs.split("/").filter(Boolean);

    // Only a database whose migrations have not run has no store.
    if (!store) {
      return { kind: "missing" as const };
    }

    let page: CategoryPage | null = null;

    if (first !== undefined) {
      page = await readCategoryPage(store, second ?? first, locale);

      if (!page) {
        return { kind: "missing" as const };
      }

      // A category asked for without its group, under another one, or
      // under one it has left: its page is elsewhere, and a link shared
      // before the move still finds it.
      if (page.path !== (second ? `/${first}/${second}` : `/${first}`)) {
        return { kind: "moved" as const, path: page.path };
      }
    }

    const copy = getDictionary(locale).storefront.catalog;
    // As of now, not cached: the header, the footer and the filter panel
    // list them (those with a published article, FER-079), and this page
    // is read per request anyway.
    const [categories, filters] = await Promise.all([
      caller.catalog.categories({ locale }),
      caller.catalog.filters({ locale }),
    ]);
    const raw = rawSearchParams(new URLSearchParams(search));
    const query = knownOnly(
      readCatalogQuery(raw, page ? { path: page.path, slug: page.slug } : null),
      filters
    );
    // The "Cargar más" link's page (FER-044): what a visitor without the
    // script, or a crawler, opens; a cursor that does not read is the
    // first page.
    const startCursor = readCatalogCursor(raw, query.sort);
    const firstPage = await caller.catalog.products({
      category: page?.slug,
      cursor: startCursor ?? undefined,
      filters: query.filters,
      locale,
      q: query.q ?? undefined,
      sort: query.sort,
    });
    const selection = selectionName(
      query,
      categories,
      filters,
      copy.searchResult
    );
    const name = page?.name ?? copy.title;
    const cover = page
      ? page.cover
      : await readAllArticlesCover(store, locale, copy.title);
    const home = getDictionary(locale).storefront.shell.home;

    return {
      breadcrumb: [
        { href: localizePath("/", locale), name: home },
        ...(page?.parent
          ? [
              {
                href: localizePath(page.parent.path, locale),
                lang: page.parent.lang,
                name: page.parent.name,
              },
            ]
          : []),
        { lang: page?.lang, name },
      ],
      categories,
      copy,
      cover,
      description: narrowed(query)
        ? interpolate(copy.filteredDescription, {
            selection: selection ?? name,
            store: store.name,
          })
        : pageDescription(copy, store, page, locale),
      filters,
      firstPage,
      heading: selection ?? name,
      kind: "page" as const,
      name,
      page,
      query,
      selection,
      startCursor,
      store,
    };
  }
);

/** The page's address in each language, its selection kept, sort aside. */
function alternatesOf(locale: Locale, query: CatalogQuery) {
  const canonical = { ...query, q: null, sort: DEFAULT_PRODUCT_SORT };

  return {
    canonical: catalogHref(locale, canonical),
    languages: {
      ...Object.fromEntries(
        LOCALES.map((language) => [language, catalogHref(language, canonical)])
      ),
      "x-default": catalogHref(DEFAULT_LOCALE, canonical),
    },
  };
}

/**
 * The address's page, read before anything is sent: an unknown one is a
 * real 404, a moved one a permanent redirect (308) with its query string.
 */
async function resolve({ params, searchParams }: CatalogPageProps) {
  const locale = await readLocale(params);
  const { category, group } = await params;
  const raw = await searchParams;
  const search = searchOf(raw);
  const loaded = await loadCatalogPage(
    locale,
    [group, category].filter(Boolean).join("/"),
    search
  );

  if (loaded.kind === "missing") {
    notFound();
  }

  if (loaded.kind === "moved") {
    const target = localizePath(loaded.path, locale);
    permanentRedirect(search ? `${target}?${search}` : target);
  }

  return { ...loaded, locale };
}

/**
 * A catalog page's title, description, canonical address and `hreflang`,
 * and its share card (FER-043): the admin's texts when there are some,
 * else words made from the page's and the store's names; with a filter or
 * a search, the selection's. The cover is the share card when there is
 * one, else the brand's card.
 */
export async function catalogMetadata(
  props: CatalogPageProps
): Promise<Metadata> {
  const loaded = await resolve(props);
  const { copy, cover, description, name, page, query, store } = loaded;
  const title = narrowed(query) ? (loaded.selection ?? name) : name;
  // The share card names the selection without the search: a search is
  // whatever someone typed, and a store's link must not carry it into a
  // chat preview under the store's name.
  const shared =
    selectionName(
      { ...query, q: null },
      loaded.categories,
      loaded.filters,
      copy.searchResult
    ) ?? name;
  const ownTitle = !narrowed(query) && page?.seoTitle ? page.seoTitle : null;
  // Its words leave the search out for the same reason.
  const sharedDescription =
    query.filters.length > 0
      ? interpolate(copy.filteredDescription, {
          selection: shared,
          store: store.name,
        })
      : pageDescription(copy, store, page, loaded.locale);

  return {
    alternates: alternatesOf(loaded.locale, query),
    description,
    openGraph: {
      description: sharedDescription,
      // This `openGraph` replaces the layout's, card included: a page
      // without a cover names the brand's card again.
      images: [
        cover
          ? {
              alt: cover.alt,
              height: cover.computer.height,
              url: absoluteUrl(cover.computer.url),
              width: cover.computer.width,
            }
          : defaultShareImage(loaded.locale),
      ],
      siteName: store.name,
      title: ownTitle ?? shared,
      type: "website",
    },
    // A search result is not a page of its own for a search engine, nor is
    // a later page of a list (FER-044): its articles move as the store
    // orders them, and each has its own page. Nor is a category the
    // storefront does not list, one with no published article (FER-079):
    // its page answers a direct visit, and the sitemap leaves it out too.
    // Its links are followed.
    ...(query.q || loaded.startCursor || page?.isShown === false
      ? { robots: { follow: true, index: false } }
      : {}),
    title: { absolute: ownTitle ?? storeTitle(title, store.name) },
  };
}

/**
 * A catalog page (FER-023, FER-043): all articles, a group or a category,
 * each with its own address, texts, cover and trail. Everything is read
 * before anything is sent and rendered behind no boundary, so the first
 * response holds the articles, the header's links and the footer: a
 * crawler that runs no script (Bingbot, most AI crawlers) reads them all
 * (docs/agents/nextjs.md § Store pages).
 */
export async function CatalogPageView(props: CatalogPageProps) {
  const loaded = await resolve(props);
  const { copy, firstPage, heading, locale, page, query, store } = loaded;
  const canonical = absoluteUrl(
    catalogHref(locale, { ...query, q: null, sort: DEFAULT_PRODUCT_SORT })
  );
  const { storefront } = getDictionary(locale);

  return (
    <StoreFrame
      copy={storefront.shell}
      currentPath={page?.path ?? ALL_ARTICLES_PATH}
      locale={locale}
      {...await shellOf(store, locale, loaded.categories)}
    >
      <main>
        <JsonLd
          data={[
            collectionPage({
              breadcrumb: loaded.breadcrumb.map((crumb) => ({
                name: crumb.name,
                url: crumb.href ? absoluteUrl(crumb.href) : canonical,
              })),
              description: loaded.description,
              items: firstPage.items.map((item) => ({
                name: item.title,
                url: absoluteUrl(localizePath(articlePath(item.slug), locale)),
              })),
              locale,
              name: heading,
              url: canonical,
            }),
            breadcrumbList(
              loaded.breadcrumb.map((crumb) => ({
                name: crumb.name,
                url: crumb.href ? absoluteUrl(crumb.href) : canonical,
              }))
            ),
          ]}
        />
        <StoreCatalog
          breadcrumb={{ items: loaded.breadcrumb, label: copy.breadcrumb }}
          categories={navigationOrder(loaded.categories).map((category) => ({
            depth: category.depth,
            lang: category.lang,
            name: category.name,
            path: category.path,
            slug: category.slug,
          }))}
          cover={loaded.cover}
          filters={loaded.filters}
          firstPage={firstPage}
          heading={heading}
          query={query}
          startCursor={loaded.startCursor}
        />
      </main>
      <StorePageFooter
        categories={loaded.categories}
        locale={locale}
        store={store}
      />
    </StoreFrame>
  );
}
