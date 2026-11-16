import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { StoreCatalogSkeleton } from "@/app/_components/molecules/store-catalog-skeleton";
import { StoreCatalog } from "@/app/_components/organisms/store-catalog";
import { StoreFrame } from "@/app/_components/organisms/store-frame";
import { getDictionary } from "@/content";
import { selectionName } from "@/lib/catalog/heading";
import {
  catalogHref,
  type CatalogQuery,
  knownOnly,
  type RawSearchParams,
  readCatalogQuery,
} from "@/lib/catalog/query";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { readLocale } from "@/lib/i18n/read-locale";
import { caller } from "@/lib/orpc/server";
import { storeTitle } from "@/lib/seo/store-metadata";
import { readStore } from "@/server/cache/store";

import { StorePageFooter } from "../store-page-footer";
import { streamedShell } from "../store-shell";

// The page reads its address and waits for its selection before anything
// is sent, by design (the first page of every selection is server-rendered);
// this tells Next's instant-navigation check that the wait is intended.
export const instant = false;

interface CatalogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<RawSearchParams>;
}

/** The store's categories and filters, read once per request. */
const loadChoices = cache(async (locale: Locale) => {
  const [categories, filters] = await Promise.all([
    caller.catalog.categories({ locale }),
    caller.catalog.filters({ locale }),
  ]);

  return { categories, filters };
});

/**
 * One line about the selection, or about the whole catalog: the page's
 * description for search engines, and the line under its heading.
 */
function describeSelection(
  copy: ReturnType<typeof getDictionary>["storefront"]["catalog"],
  store: string,
  selection: string | null
) {
  return selection
    ? interpolate(copy.filteredDescription, { selection, store })
    : interpolate(copy.description, { store });
}

/** The page's address in each language, its selection kept, sort aside. */
function alternatesOf(locale: Locale, query: CatalogQuery) {
  const canonical = { ...query, q: null, sort: "newest" as const };

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
 * The title and description of this exact selection, so a link pasted into
 * WhatsApp reads "Collares · Dorado", not just the store's name.
 */
export async function generateMetadata({
  params,
  searchParams,
}: CatalogPageProps): Promise<Metadata> {
  const locale = await readLocale(params);
  // The query string first: it is what makes this request-time, before the
  // cached reads below, which the build (no database) must never run.
  const raw = await searchParams;
  const store = await readStore();

  if (!store) {
    return {};
  }

  const copy = getDictionary(locale).storefront.catalog;
  const { categories, filters } = await loadChoices(locale);
  const query = knownOnly(readCatalogQuery(raw), categories, filters);
  const selection = selectionName(
    query,
    categories,
    filters,
    copy.searchResult
  );
  const title = selection ?? copy.title;
  // The share card names the selection without the search: a search is
  // whatever someone typed, and a store's link must not carry it into a
  // chat preview under the store's name.
  const shared =
    selectionName(
      { ...query, q: null },
      categories,
      filters,
      copy.searchResult
    ) ?? copy.title;
  const describe = (name: string | null) =>
    describeSelection(copy, store.name, name);

  return {
    alternates: alternatesOf(locale, query),
    description: describe(selection),
    openGraph: {
      description: describe(shared === copy.title ? null : shared),
      title: shared,
      type: "website",
    },
    // A search result is not a page of its own for a search engine.
    ...(query.q ? { robots: { follow: true, index: false } } : {}),
    title: { absolute: storeTitle(title, store.name) },
  };
}

/**
 * The store's catalog (FER-023). The selection is the address, read on the
 * server: the first page of every selection is rendered here, with its own
 * heading. The page reads the query string, so it is rendered per request
 * (docs/agents/nextjs.md § Store pages).
 */
export default async function CatalogPage({
  params,
  searchParams,
}: CatalogPageProps) {
  const locale = await readLocale(params);

  return (
    <StoreFrame
      copy={getDictionary(locale).storefront.shell}
      current="catalog"
      locale={locale}
      {...streamedShell(locale)}
    >
      <Suspense fallback={<StoreCatalogSkeleton />}>
        <CatalogResolver params={params} searchParams={searchParams} />
      </Suspense>
    </StoreFrame>
  );
}

async function CatalogResolver({ params, searchParams }: CatalogPageProps) {
  const locale = await readLocale(params);
  // The query string first, as in the metadata above.
  const raw = await searchParams;
  const store = await readStore();

  // Only a database whose migrations have not run has no store.
  if (!store) {
    notFound();
  }

  const copy = getDictionary(locale).storefront.catalog;
  const { categories, filters } = await loadChoices(locale);
  const query = knownOnly(readCatalogQuery(raw), categories, filters);
  const firstPage = await caller.catalog.products({
    category: query.category ?? undefined,
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

  return (
    <>
      <main>
        <StoreCatalog
          categories={categories}
          description={describeSelection(copy, store.name, selection)}
          filters={filters}
          firstPage={firstPage}
          heading={selection ?? copy.title}
          query={query}
        />
      </main>
      <StorePageFooter locale={locale} store={store} />
    </>
  );
}
