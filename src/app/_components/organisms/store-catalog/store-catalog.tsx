"use client";

import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import {
  Dialog as DialogPrimitive,
  DropdownMenu as DropdownMenuPrimitive,
} from "radix-ui";
import { useEffect, useRef, useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { StoreChip } from "@/app/_components/atoms/store-chip";
import { StoreArticleCard } from "@/app/_components/molecules/store-article-card";
import {
  StoreBreadcrumb,
  type StoreBreadcrumbItem,
} from "@/app/_components/molecules/store-breadcrumb";
import { StoreCatalogCover } from "@/app/_components/molecules/store-catalog-cover";
import {
  type CatalogCategory,
  type CatalogFilter,
  StoreCatalogFilters,
} from "@/app/_components/molecules/store-catalog-filters";
import { StoreShareButton } from "@/app/_components/molecules/store-share-button";
import type { CatalogCover } from "@/lib/catalog/cover";
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
import { PRODUCT_SORTS } from "@/lib/schemas/catalog";

export interface StoreCatalogProps {
  /** The trail from the home to this page, shown above it (FER-043). */
  breadcrumb: { items: readonly StoreBreadcrumbItem[]; label: string };
  categories: CatalogCategory[];
  /** The page's photo, with its title over it; none, a plain title. */
  cover: CatalogCover | null;
  /** The one line under the heading: what this selection is, in the store. */
  description: string;
  filters: CatalogFilter[];
  /** The first page, rendered by the server for this exact selection. */
  firstPage: CatalogPage;
  /** The page's heading: the selection's name, or "Catálogo". */
  heading: string;
  query: CatalogQuery;
}

/** The page's side margins: 16 px on a phone, 28 px from a tablet up. */
const GUTTER_CLASS = "px-4 md:px-7";

const TEXT_LINK_CLASS =
  "inline-flex min-h-11 items-center px-2 text-sm font-semibold text-store-foreground underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground";

/**
 * The store's catalog (FER-023, FER-039): a centered heading and one line
 * about the selection, then a bar with "Filtrar", which opens the panel of
 * categories and filters (a drawer from the left on a computer, a sheet from
 * the bottom on a phone), and the sort on the right; the chosen ones as
 * removable chips; and a grid of four columns (two on a phone) that loads
 * the next page as it scrolls, or with its button. Everything chosen lives
 * in the address, so a shared link opens on the same selection.
 */
function StoreCatalog({
  breadcrumb,
  categories,
  cover,
  description,
  filters,
  firstPage,
  heading,
  query,
}: StoreCatalogProps) {
  const { storefront } = useDictionary();
  const copy = storefront.catalog;
  const cardLabels = { card: storefront.articleCard, price: storefront.price };
  const locale = useLocale();
  const [panelOpen, setPanelOpen] = useState(false);
  const grid = useRef<HTMLUListElement>(null);
  // Set when "Cargar más" (or its retry) is pressed: the first card of the
  // page it asked for takes focus once it lands, since the button may then
  // be gone. It names the selection it was pressed in (another selection's
  // first page is no page it asked for) and the control pressed: focus the
  // visitor took elsewhere meanwhile, the sort say, stays there.
  const focusFrom = useRef<{
    from: number;
    selection: string;
    trigger: HTMLElement;
  } | null>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const { attachSentinel, fetchNextPage, ...products } = useCatalogProducts({
    firstPage,
    locale,
    query,
  });
  const href = (next: CatalogQuery) => catalogHref(locale, next);
  const selection = href(query);

  // Moving focus to a page that just arrived, or to the retry when it
  // failed, is the DOM work this effect synchronises with the list.
  useEffect(() => {
    const pending = focusFrom.current;

    if (pending === null) {
      return;
    }

    if (pending.selection !== selection || !ownsFocus(pending.trigger)) {
      focusFrom.current = null;
    } else if (products.items.length > pending.from) {
      focusFrom.current = null;
      grid.current?.children[pending.from]?.querySelector("a")?.focus();
    } else if (products.isFetchNextPageError) {
      // The pressed button went with the failed page: its retry takes over.
      focusFrom.current = null;
      retry.current?.focus();
    }
  }, [products.isFetchNextPageError, products.items.length, selection]);
  const chosen = chosenChips(query, categories, filters);
  // The panel offers the categories and the filters; the search is not one
  // of its choices, so it does not count on its button.
  const panelChoices = chosen.filter((chip) => chip.key !== "q").length;

  return (
    <div
      className="flex w-full flex-col pb-12 text-store-foreground md:pb-18"
      data-slot="store-catalog"
      data-testid="store-catalog"
    >
      <header className="flex flex-col">
        <StoreBreadcrumb
          className={`${GUTTER_CLASS} py-1.5`}
          items={breadcrumb.items}
          label={breadcrumb.label}
        />
        {cover ? (
          <StoreCatalogCover cover={cover}>
            <h1 className="max-w-[18ch] font-display store-display-page leading-display font-extrabold wrap-anywhere uppercase">
              {heading}
            </h1>
          </StoreCatalogCover>
        ) : null}
        <div
          className={`${GUTTER_CLASS} flex flex-col items-center gap-3 pb-5.5 text-center md:pb-7.5 ${cover ? "pt-5 md:pt-7" : "pt-7 md:pt-11"}`}
        >
          {cover ? null : (
            <h1 className="font-display store-display-page leading-display font-extrabold wrap-anywhere uppercase">
              {heading}
            </h1>
          )}
          <p className="max-w-prose text-sm text-store-muted md:text-base">
            {description}
          </p>
          <StoreShareButton
            className="justify-center"
            path={selection}
            title={heading}
          />
        </div>
      </header>
      <div
        className={`${GUTTER_CLASS} flex items-center justify-between gap-3 pb-3.5 md:pb-4.5`}
        data-slot="store-catalog-bar"
      >
        <DialogPrimitive.Root onOpenChange={setPanelOpen} open={panelOpen}>
          <DialogPrimitive.Trigger asChild>
            <StoreButton variant="outline">
              <SlidersHorizontal aria-hidden="true" />
              {copy.filter}
              {panelChoices > 0 ? ` (${panelChoices})` : null}
            </StoreButton>
          </DialogPrimitive.Trigger>
          {/* In place, not in a portal, like every storefront dialog. It
              opens with a short slide, which reduced motion drops
              (src/styles/globals.css), and leaves at once: a category is a
              page of its own (FER-043), and the page left behind stays
              mounted, hidden, where an exit animation never ends and would
              keep its scrim in the document (design.md § Admin, the menu). */}
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 bg-store-foreground/50 data-[state=open]:animate-in data-[state=open]:fade-in-0"
            data-slot="dialog-overlay"
            data-testid="dialog-overlay"
          />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 flex h-[86dvh] flex-col overflow-hidden rounded-t-2xl bg-store-background text-store-foreground shadow-lg duration-200 outline-none data-[state=open]:animate-in max-md:data-[state=open]:slide-in-from-bottom md:inset-y-0 md:right-auto md:h-full md:w-full md:max-w-100 md:rounded-none md:data-[state=open]:slide-in-from-left"
            data-slot="dialog-content"
            data-testid="store-catalog-panel"
          >
            <div className="flex items-center justify-between gap-3 border-b border-store-line py-3 pr-2 pl-4 md:pl-6">
              <DialogPrimitive.Title className="font-display text-lg leading-none font-extrabold uppercase">
                {copy.filter}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <StoreButton
                  aria-label={copy.closeFilters}
                  size="icon"
                  variant="ghost"
                >
                  <X aria-hidden="true" />
                </StoreButton>
              </DialogPrimitive.Close>
            </div>
            {/* Following a choice leaves the panel open: the shopper may
                pick several before looking at the grid behind it. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
              <StoreCatalogFilters
                categories={categories}
                copy={copy}
                filters={filters}
                idPrefix="panel"
                locale={locale}
                onCategoryChoice={() => {
                  setPanelOpen(false);
                }}
                query={query}
              />
            </div>
            <div className="flex items-center gap-2.5 border-t border-store-line px-4 pt-3 pb-4 md:px-6">
              {isFiltered(query) ? (
                <Link
                  className={TEXT_LINK_CLASS}
                  href={href(clearFilters(query))}
                  scroll={false}
                >
                  {copy.clear}
                </Link>
              ) : null}
              <DialogPrimitive.Close asChild>
                <StoreButton className="flex-1" size="lg">
                  {copy.showResults}
                </StoreButton>
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Root>
        {/* Links, like the other choices: moving through the menu never
            navigates by itself, and a sort is a link that can be shared. */}
        <DropdownMenuPrimitive.Root modal={false}>
          <DropdownMenuPrimitive.Trigger
            className="inline-flex min-h-11 items-center gap-1.5 font-display text-xs leading-none font-extrabold text-store-foreground uppercase focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
            data-slot="store-catalog-sort"
          >
            {/* On a phone only the sort shows; a screen reader hears both. */}
            <span className="sr-only sm:not-sr-only">
              {copy.sort.label}
            </span>{" "}
            <span className="underline decoration-2 underline-offset-4">
              {copy.sort[query.sort]}
            </span>
            <ChevronDown aria-hidden="true" className="size-4" />
          </DropdownMenuPrimitive.Trigger>
          <DropdownMenuPrimitive.Content
            align="end"
            className="z-30 min-w-60 border-2 border-store-foreground bg-store-background p-1 text-store-foreground shadow-lg outline-none"
            data-testid="store-catalog-sort-menu"
            loop
            sideOffset={6}
          >
            {PRODUCT_SORTS.map((sort) => (
              <DropdownMenuPrimitive.Item asChild key={sort}>
                <Link
                  aria-current={query.sort === sort ? "true" : undefined}
                  className="flex min-h-11 items-center justify-between gap-4 px-3 text-sm outline-none data-highlighted:bg-store-foreground data-highlighted:text-store-background"
                  href={href({ ...query, sort })}
                  scroll={false}
                >
                  {copy.sort[sort]}
                  {query.sort === sort ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : null}
                </Link>
              </DropdownMenuPrimitive.Item>
            ))}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Root>
      </div>
      {chosen.length > 0 ? (
        <div
          className={`${GUTTER_CLASS} flex flex-wrap items-center gap-2 pb-5`}
          data-slot="store-catalog-chosen"
        >
          <h2 className="sr-only">{copy.selected}</h2>
          <ul className="flex flex-wrap gap-2">
            {chosen.map((chip) => (
              <li key={chip.key}>
                <StoreChip asChild className="gap-2" selected>
                  <Link
                    aria-label={interpolate(copy.remove, { name: chip.name })}
                    href={href(chip.without)}
                    scroll={false}
                  >
                    {chip.name}
                    <X aria-hidden="true" className="size-4" />
                  </Link>
                </StoreChip>
              </li>
            ))}
          </ul>
          <Link
            className={TEXT_LINK_CLASS}
            href={href(clearFilters(query))}
            scroll={false}
          >
            {copy.clearAll}
          </Link>
        </div>
      ) : null}
      <div className={`${GUTTER_CLASS} flex flex-col gap-8`}>
        {products.items.length === 0 ? (
          <div
            className="flex flex-col items-center gap-4 bg-store-surface px-6 py-12 text-center"
            data-testid="store-catalog-empty"
          >
            <h2 className="font-display text-lg leading-tight font-extrabold uppercase">
              {isFiltered(query) ? copy.noResults.title : copy.empty.title}
            </h2>
            <p className="max-w-prose text-base">
              {isFiltered(query) ? copy.noResults.body : copy.empty.body}
            </p>
            {isFiltered(query) ? (
              <StoreButton asChild variant="outline">
                <Link href={href(clearFilters(query))}>
                  {copy.noResults.clear}
                </Link>
              </StoreButton>
            ) : null}
          </div>
        ) : (
          <ul
            className="grid grid-cols-2 gap-x-2.5 gap-y-6 md:grid-cols-4 md:gap-x-3.5 md:gap-y-9"
            data-testid="store-catalog-grid"
            ref={grid}
          >
            {products.items.map((item) => (
              <li className="min-w-0" key={item.id}>
                <StoreArticleCard
                  amount={item.priceAmount}
                  currency={item.currencyCode}
                  headingLevel="h2"
                  href={localizePath(`/products/${item.slug}`, locale)}
                  image={
                    item.cover
                      ? { alt: item.cover.alt, src: item.cover.url }
                      : null
                  }
                  labels={cardLabels}
                  locale={locale}
                  name={item.title}
                  nameLang={item.lang}
                  // Four columns from a tablet up, two on a phone.
                  sizes="(min-width: 768px) 25vw, 50vw"
                  unavailable={!item.isAvailable}
                />
              </li>
            ))}
          </ul>
        )}
        {products.isFetchNextPageError ? (
          <div className="flex flex-col items-center gap-3" role="alert">
            <p className="text-sm">{copy.loadFailed}</p>
            <StoreButton
              onClick={(event) => {
                focusFrom.current = {
                  from: products.items.length,
                  selection,
                  trigger: event.currentTarget,
                };
                fetchNextPage();
              }}
              ref={retry}
              variant="outline"
            >
              {copy.retry}
            </StoreButton>
          </div>
        ) : null}
        {products.hasNextPage && !products.isFetchNextPageError ? (
          <div className="flex justify-center" ref={attachSentinel}>
            {/* Never disabled: a disabled button drops the keyboard's focus
                to the page. While a page loads, a press does nothing. */}
            <StoreButton
              aria-busy={products.isFetchingNextPage}
              aria-disabled={products.isFetchingNextPage}
              onClick={(event) => {
                if (!products.isFetchingNextPage) {
                  focusFrom.current = {
                    from: products.items.length,
                    selection,
                    trigger: event.currentTarget,
                  };
                  fetchNextPage();
                }
              }}
              variant="outline"
            >
              {products.isFetchingNextPage ? copy.loading : copy.loadMore}
            </StoreButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Whether the control that asked for a page still speaks for the focus: it
 * holds it, or it was removed and the focus fell to the page with it.
 */
function ownsFocus(trigger: HTMLElement) {
  const active = document.activeElement;

  return (
    active === trigger ||
    (!trigger.isConnected && (active === null || active === document.body))
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
  const category = categories.find(
    (entry) => entry.slug === query.category?.slug
  );

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
