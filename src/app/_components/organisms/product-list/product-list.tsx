"use client";

import { Plus, SearchX, Tag } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef } from "react";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import { Pagination } from "@/app/_components/molecules/pagination";
import { ProductActiveFilters } from "@/app/_components/molecules/product-active-filters";
import { ProductFilterPanel } from "@/app/_components/molecules/product-filter-panel";
import { ProductListHead } from "@/app/_components/molecules/product-list-head";
import { ProductListRow } from "@/app/_components/molecules/product-list-row";
import { ProductSearch } from "@/app/_components/molecules/product-search";
import { ProductSortMenu } from "@/app/_components/molecules/product-sort-menu";
import type { Dictionary } from "@/content";
import { followedLink } from "@/lib/admin/followed-link";
import { activeFilterChips } from "@/lib/admin/product-filters";
import {
  isNarrowed,
  newProductPath,
  type ProductsQuery,
  productPath,
  productsListInput,
  productsPath,
  withoutFilters,
} from "@/lib/admin/products";
import { useStoreAttributes } from "@/lib/hooks/attribute";
import { useStoreCategories } from "@/lib/hooks/category";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { type ProductsPage, useProducts } from "@/lib/hooks/product";
import { useNow } from "@/lib/hooks/ui";
import type { Locale } from "@/lib/i18n/config";
import { interpolate } from "@/lib/i18n/interpolate";
import { formatInteger } from "@/lib/utils/format";

export interface ProductListProps {
  /** The list's selection in the address, already read. */
  query: ProductsQuery;
  /** When the server rendered the screen: the clock the ages start from. */
  renderedAt: number;
}

type ListCopy = Dictionary["articles"]["list"];

/**
 * What the list says about its page: how many articles match ("49
 * artículos", "Más de 10.000 artículos") and which of them it shows
 * ("25–48 de 49"), the figures in the page's language.
 */
function summaryOf(page: ProductsPage, copy: ListCopy, locale: Locale) {
  const total = formatInteger(page.total, locale);
  const from = (page.page - 1) * page.limit + 1;
  let count = interpolate(copy.count, { count: total });

  if (page.totalCapped) {
    count = interpolate(copy.countCapped, { count: total });
  } else if (page.total === 1) {
    count = copy.countOne;
  }

  return {
    count,
    range: interpolate(
      page.totalCapped ? copy.pages.rangeCapped : copy.pages.range,
      {
        from: formatInteger(from, locale),
        to: formatInteger(from + page.items.length - 1, locale),
        total,
      }
    ),
  };
}

/**
 * Why the list shows no rows, with the way on: the store has no article
 * yet; nothing matches the search and filters (clear them); or the page is
 * past the last one, an old link (back to the first).
 */
function NoRows({ page, query }: { page: ProductsPage; query: ProductsQuery }) {
  const copy = useDictionary().articles.list;
  const locale = useLocale();

  if (page.total === 0 && !isNarrowed(query)) {
    return (
      <EmptyState
        className="rounded-lg border bg-card px-6"
        icon={Tag}
        message={copy.empty}
      />
    );
  }

  const noMatches = page.total === 0;

  return (
    <div
      className="flex flex-col items-center rounded-lg border bg-card px-6 pb-8"
      data-testid={
        noMatches ? "product-list-no-matches" : "product-list-empty-page"
      }
    >
      <EmptyState
        icon={noMatches ? SearchX : undefined}
        message={noMatches ? copy.noMatches.message : copy.emptyPage.message}
      />
      <Button asChild size="sm" variant="outline">
        <Link
          href={productsPath(
            locale,
            noMatches
              ? { ...withoutFilters(query), q: null }
              : { ...query, page: 1 }
          )}
        >
          {noMatches ? copy.noMatches.clear : copy.emptyPage.first}
        </Link>
      </Button>
    </div>
  );
}

/** The four states a read can be in before it has rows to show. */
function ReadState({
  products,
}: {
  products: Pick<
    ReturnType<typeof useProducts>,
    "isError" | "isPending" | "refetch"
  >;
}) {
  const { articles, common } = useDictionary();

  if (products.isPending) {
    return (
      <div
        aria-busy="true"
        className="space-y-2"
        data-testid="product-list-skeleton"
      >
        <span className="sr-only">{common.loading}</span>
        {["first", "second", "third"].map((row) => (
          <Skeleton className="h-24 w-full rounded-lg xl:h-16" key={row} />
        ))}
      </div>
    );
  }

  if (products.isError) {
    return (
      <div
        className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
        role="alert"
      >
        <p className="text-sm">{articles.list.errors.load}</p>
        <Button
          onClick={() => {
            void products.refetch();
          }}
          size="sm"
          variant="outline"
        >
          {common.tryAgain}
        </Button>
      </div>
    );
  }

  return null;
}

/**
 * The store's articles (FER-017, FER-019), the admin's list in Vercel's
 * dashboard style: a toolbar with the search, "Filtros" (a side sheet) and,
 * below `xl`, "Ordenar"; the active filters as chips; how many articles
 * match; the table (one card of rows under sortable column names from `xl`
 * up, a card per article below); and numbered pages at its foot. Everything
 * is the address (`ProductsQuery`), which the page reads and prefetches, so
 * a selection survives a reload, a bookmark and back and forward. The page
 * a step of the pages brings is focused (the table, named and described by
 * its range) once it shows. "Nuevo artículo" is the screen's main action
 * (under the thumb on a phone). Inline edits, bulk edits and the store's
 * own order come later in FER-019.
 */
function ProductList({ query, renderedAt }: ProductListProps) {
  const copy = useDictionary().articles.list;
  const locale = useLocale();
  const now = useNow(renderedAt);
  const products = useProducts(productsListInput(query, locale));
  // `undefined` until read: the filter panel keeps the address's selection
  // rather than drop it as unknown to a list it has not got.
  const categories = useStoreCategories().data;
  const attributes = useStoreAttributes().data;
  const page = products.data;
  const filtersButton = useRef<HTMLButtonElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const rangeId = useId();
  // A step of the pages was followed: its page takes focus once it shows.
  const paging = useRef(false);
  const shownPage = products.isPlaceholderData ? null : (page?.page ?? null);

  useEffect(() => {
    if (shownPage !== null && paging.current) {
      // Disarmed even when the page has no table (past the end): it was
      // this step's, never a later one's.
      paging.current = false;
      table.current?.focus();
    }
  }, [shownPage]);

  const chips = activeFilterChips(query, {
    attributes: attributes ?? [],
    categories: categories ?? [],
    copy,
    locale,
  });
  const summary = page ? summaryOf(page, copy, locale) : null;

  return (
    <section data-slot="product-list" data-testid="product-list">
      <AdminPage
        primaryAction={
          <Button asChild className="w-full md:w-auto">
            <Link href={newProductPath(locale)}>
              <Plus aria-hidden />
              {copy.new}
            </Link>
          </Button>
        }
        title={copy.title}
      >
        <div className="space-y-3">
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="product-list-toolbar"
          >
            <ProductSearch className="flex-[1_1_16rem]" query={query} />
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <ProductFilterPanel
                activeCount={chips.length}
                attributes={attributes}
                categories={categories}
                query={query}
                ref={filtersButton}
              />
              <ProductSortMenu className="xl:hidden" query={query} />
            </div>
          </div>
          <ProductActiveFilters
            chips={chips}
            clearHref={productsPath(locale, withoutFilters(query))}
            fallbackFocus={filtersButton}
            hrefOf={(chip) => productsPath(locale, chip.without)}
          />
          <ReadState products={products} />
          {summary ? (
            <p
              aria-live="polite"
              className="text-xs text-muted-foreground"
              data-testid="product-list-count"
            >
              {summary.count}
            </p>
          ) : null}
          {page && page.items.length === 0 ? (
            <NoRows page={page} query={query} />
          ) : null}
          {page && page.items.length > 0 ? (
            <table
              aria-describedby={rangeId}
              aria-label={copy.label}
              className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring xl:overflow-hidden xl:border xl:bg-card"
              data-testid="product-list-table"
              ref={table}
              // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- `block` drops a table's implicit roles in WebKit, so they are said outright (rows and cells: `product-list-row`)
              role="table"
              tabIndex={-1}
            >
              <ProductListHead query={query} />
              <tbody
                className="block space-y-2 xl:space-y-0 xl:divide-y"
                data-testid="product-list-rows"
                // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- `block`, as the table's
                role="rowgroup"
              >
                {page.items.map((item) => (
                  <ProductListRow
                    copy={copy}
                    currency={page.currencyCode}
                    href={productPath(item.id, locale)}
                    item={item}
                    key={item.id}
                    locale={locale}
                    now={now}
                  />
                ))}
              </tbody>
            </table>
          ) : null}
          {page && summary && page.total > 0 ? (
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1"
              data-testid="product-list-foot"
              onClickCapture={(event) => {
                const link = followedLink(event);

                // The current page's own link changes nothing either.
                if (
                  link !== null &&
                  link.getAttribute("href") !== productsPath(locale, query)
                ) {
                  paging.current = true;
                }
              }}
            >
              <p
                className="text-xs text-muted-foreground tabular-nums"
                data-testid="product-list-range"
                id={rangeId}
              >
                {page.items.length > 0 ? summary.range : null}
              </p>
              <Pagination
                hrefFor={(number) =>
                  productsPath(locale, { ...query, page: number })
                }
                page={query.page}
                pageCount={page.pageCount}
              />
            </div>
          ) : null}
        </div>
      </AdminPage>
    </section>
  );
}

export { ProductList };
