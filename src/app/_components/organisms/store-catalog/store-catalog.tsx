"use client";

import { SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { StoreArrowLink } from "@/app/_components/atoms/store-arrow-link";
import { StoreChip } from "@/app/_components/atoms/store-chip";
import { StoreAddToCartButton } from "@/app/_components/molecules/store-add-to-cart-button";
import { StoreArticleCard } from "@/app/_components/molecules/store-article-card";
import {
  type CatalogCategory,
  type CatalogFilter,
  StoreCatalogFilters,
} from "@/app/_components/molecules/store-catalog-filters";
import { StoreCatalogSearch } from "@/app/_components/molecules/store-catalog-search";
import { StoreShareButton } from "@/app/_components/molecules/store-share-button";
import {
  type CatalogQuery,
  catalogHref,
  clearFilters,
  isFiltered,
  toggleFilterValue,
} from "@/lib/catalog/query";
import { type CatalogPage, useCatalogProducts } from "@/lib/hooks/catalog";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import { PRODUCT_SORTS, type ProductSort } from "@/lib/schemas/catalog";

export interface StoreCatalogProps {
  categories: CatalogCategory[];
  filters: CatalogFilter[];
  /** The first page, rendered by the server for this exact selection. */
  firstPage: CatalogPage;
  /** The page's heading: the selection's name, or "Catálogo". */
  heading: string;
  query: CatalogQuery;
  storeSlug: string;
}

const CONTROL_CLASS =
  "h-11 border-2 border-store-contrast bg-store-background px-3 text-sm font-semibold text-store-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground";

/**
 * A store's catalog (FER-023): the heading and the share button, the search,
 * the sort, the store's choices (a sidebar on a computer, a sheet on a
 * phone), the chosen ones as removable chips, and the grid, which loads the
 * next page as it scrolls (or with its button). Everything chosen lives in
 * the address, so a shared link opens on the same selection.
 */
function StoreCatalog({
  categories,
  filters,
  firstPage,
  heading,
  query,
  storeSlug,
}: StoreCatalogProps) {
  const { storefront } = useDictionary();
  const copy = storefront.catalog;
  const cardLabels = { card: storefront.articleCard, price: storefront.price };
  const locale = useLocale();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { attachSentinel, fetchNextPage, ...products } = useCatalogProducts({
    firstPage,
    locale,
    query,
    storeSlug,
  });
  const href = (next: CatalogQuery) => catalogHref(storeSlug, locale, next);
  const chosen = chosenChips(query, categories, filters);
  const filterProps = { categories, copy, filters, locale, query, storeSlug };

  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:py-12"
      data-slot="store-catalog"
      data-testid="store-catalog"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display store-display-section leading-display tracking-display wrap-anywhere text-store-foreground uppercase">
          {heading}
        </h1>
        <StoreShareButton title={heading} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StoreCatalogSearch
          className="min-w-48 flex-1"
          query={query}
          storeSlug={storeSlug}
        />
        <label className="sr-only" htmlFor="store-catalog-sort">
          {copy.sort.label}
        </label>
        <select
          className={CONTROL_CLASS}
          id="store-catalog-sort"
          onChange={(event) => {
            const sort = PRODUCT_SORTS.find(
              (known) => known === event.target.value
            );

            if (sort) {
              router.push(href({ ...query, sort }), { scroll: false });
            }
          }}
          value={query.sort}
        >
          {PRODUCT_SORTS.map((sort: ProductSort) => (
            <option key={sort} value={sort}>
              {copy.sort[sort]}
            </option>
          ))}
        </select>
        <DialogPrimitive.Root onOpenChange={setSheetOpen} open={sheetOpen}>
          <DialogPrimitive.Trigger
            className={`${CONTROL_CLASS} inline-flex items-center gap-2 md:hidden`}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            {copy.filters}
            {chosen.length > 0 ? ` (${chosen.length})` : null}
          </DialogPrimitive.Trigger>
          {/* In place, not in a portal: it keeps the store's palette. */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 bg-store-background"
            data-slot="dialog-overlay"
            data-testid="dialog-overlay"
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-0 z-50 flex flex-col gap-6 overflow-y-auto bg-store-background p-4 text-store-foreground outline-none"
            data-slot="dialog-content"
            data-testid="store-catalog-sheet"
            // Following a choice closes the sheet on the new selection.
            onClickCapture={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("a")
              ) {
                setSheetOpen(false);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <DialogPrimitive.Title className="font-display text-2xl leading-none tracking-display uppercase">
                {copy.filters}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="inline-flex size-11 items-center justify-center hover:bg-store-surface focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground">
                <X aria-hidden="true" className="size-6" />
                <span className="sr-only">{copy.closeFilters}</span>
              </DialogPrimitive.Close>
            </div>
            <StoreCatalogFilters idPrefix="sheet" {...filterProps} />
            <DialogPrimitive.Close className="mt-auto inline-flex min-h-11 items-center justify-center bg-store-contrast px-4 font-semibold text-store-background focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground">
              {copy.showResults}
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Root>
      </div>
      {chosen.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="sr-only">{copy.selected}</h2>
          <ul className="flex flex-wrap gap-2">
            {chosen.map((chip) => (
              <li key={chip.key}>
                <StoreChip asChild className="gap-2" selected>
                  <Link
                    aria-label={interpolate(copy.remove, { name: chip.name })}
                    href={href(chip.without)}
                  >
                    {chip.name}
                    <X aria-hidden="true" className="size-4" />
                  </Link>
                </StoreChip>
              </li>
            ))}
          </ul>
          <Link
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-store-foreground underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
            href={href(clearFilters(query))}
          >
            {copy.clearAll}
          </Link>
        </div>
      ) : null}
      <div className="flex flex-col gap-8 md:grid md:grid-cols-[16rem_1fr]">
        <StoreCatalogFilters
          className="hidden md:flex"
          idPrefix="sidebar"
          {...filterProps}
        />
        <div className="flex flex-col gap-8">
          {products.items.length === 0 ? (
            <div
              className="flex flex-col items-start gap-4 bg-store-surface p-6"
              data-testid="store-catalog-empty"
            >
              <h2 className="font-display text-3xl leading-display tracking-display uppercase">
                {isFiltered(query) ? copy.noResults.title : copy.empty.title}
              </h2>
              <p className="text-base">
                {isFiltered(query) ? copy.noResults.body : copy.empty.body}
              </p>
              {isFiltered(query) ? (
                <StoreArrowLink href={href(clearFilters(query))}>
                  {copy.noResults.clear}
                </StoreArrowLink>
              ) : null}
            </div>
          ) : (
            <ul
              className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3"
              data-testid="store-catalog-grid"
            >
              {products.items.map((item) => (
                <li key={item.id} lang={item.lang}>
                  <StoreArticleCard
                    action={
                      item.isAvailable ? (
                        <StoreAddToCartButton
                          name={item.title}
                          productId={item.id}
                          storeSlug={storeSlug}
                        />
                      ) : undefined
                    }
                    amount={item.priceAmount}
                    currency={item.currencyCode}
                    headingLevel="h2"
                    href={localizePath(
                      `/${storeSlug}/products/${item.slug}`,
                      locale
                    )}
                    labels={cardLabels}
                    image={
                      item.cover
                        ? { alt: item.cover.alt, src: item.cover.url }
                        : null
                    }
                    locale={locale}
                    name={item.title}
                    unavailable={!item.isAvailable}
                  />
                </li>
              ))}
            </ul>
          )}
          {products.isFetchNextPageError ? (
            <div className="flex flex-col items-start gap-2" role="alert">
              <p className="text-sm">{copy.loadFailed}</p>
              <button
                className={CONTROL_CLASS}
                onClick={() => {
                  fetchNextPage();
                }}
                type="button"
              >
                {copy.retry}
              </button>
            </div>
          ) : null}
          {products.hasNextPage && !products.isFetchNextPageError ? (
            <div className="flex justify-center" ref={attachSentinel}>
              <button
                aria-busy={products.isFetchingNextPage}
                className={CONTROL_CLASS}
                disabled={products.isFetchingNextPage}
                onClick={() => {
                  fetchNextPage();
                }}
                type="button"
              >
                {products.isFetchingNextPage ? copy.loading : copy.loadMore}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The selection as removable chips: the category, each filter value and
 * the search, each with the address without it.
 */
function chosenChips(
  query: CatalogQuery,
  categories: CatalogCategory[],
  filters: CatalogFilter[]
) {
  const chips: { key: string; name: string; without: CatalogQuery }[] = [];
  const category = categories.find((entry) => entry.slug === query.category);

  if (category) {
    chips.push({
      key: `category:${category.slug}`,
      name: category.name,
      without: { ...query, category: null },
    });
  }

  for (const entry of query.filters) {
    const filter = filters.find((known) => known.slug === entry.attribute);

    for (const slug of entry.values) {
      const value = filter?.values.find((known) => known.slug === slug);

      if (filter && value) {
        chips.push({
          key: `${filter.slug}:${slug}`,
          name: value.name,
          without: toggleFilterValue(query, filter.slug, slug),
        });
      }
    }
  }

  if (query.q) {
    chips.push({ key: "q", name: query.q, without: { ...query, q: null } });
  }

  return chips;
}

export { StoreCatalog };
