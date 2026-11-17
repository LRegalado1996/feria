"use client";

import { Check, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import {
  Dialog as DialogPrimitive,
  DropdownMenu as DropdownMenuPrimitive,
} from "radix-ui";
import { type MouseEvent, useEffect, useRef, useState } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
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
import type { CatalogCover } from "@/lib/catalog/cover";
import { articlePath } from "@/lib/catalog/paths";
import {
  type CatalogQuery,
  catalogHref,
  clearFilters,
  isFiltered,
} from "@/lib/catalog/query";
import { type CatalogPage, useCatalogProducts } from "@/lib/hooks/catalog";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { localizePath } from "@/lib/i18n/paths";
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORTS,
  type ProductCursor,
} from "@/lib/schemas/catalog";
import { formatInteger } from "@/lib/utils/format";

export interface StoreCatalogProps {
  /** The trail from the home to this page, shown under its cover (FER-043). */
  breadcrumb: { items: readonly StoreBreadcrumbItem[]; label: string };
  categories: CatalogCategory[];
  /** The page's photo, with its title over it; none, a plain title. */
  cover: CatalogCover | null;
  filters: CatalogFilter[];
  /** The page the server rendered for this exact selection and address. */
  firstPage: CatalogPage;
  /** The page's heading: the selection's name, or "Catálogo". */
  heading: string;
  query: CatalogQuery;
  /**
   * Where the server's page started: `null` for the first page, else the
   * cursor the address carried (a "Cargar más" link followed without the
   * script, FER-044).
   */
  startCursor?: ProductCursor | null;
}

/** The page's side margins: 16 px on a phone, 28 px from a tablet up. */
const GUTTER_CLASS = "px-4 md:px-7";

const TEXT_LINK_CLASS =
  "inline-flex min-h-11 items-center px-2 text-sm font-semibold text-store-foreground underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground";

/** A click the browser should keep: a new tab, a new window, a download. */
function opensElsewhere(event: MouseEvent) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

/**
 * The store's catalog (FER-023, FER-039, FER-044): the page's cover, the
 * width of the window with its title over it (or a centered title), the
 * trail home under it, then a bar with "Filtrar", which opens the panel of
 * categories and filters (a drawer from the left on a computer, a sheet
 * from the bottom on a phone) and says how many filters are chosen, and
 * the sort on the right; and a grid of four columns (two on a phone) that
 * loads the next page by itself as the shopper nears its end. "Cargar más"
 * is a real link to that page, for a visitor without the script and for a
 * crawler; with the script it loads in place. Everything chosen lives in
 * the address, so a shared link opens on the same selection.
 */
function StoreCatalog({
  breadcrumb,
  categories,
  cover,
  filters,
  firstPage,
  heading,
  query,
  startCursor = null,
}: StoreCatalogProps) {
  const { storefront } = useDictionary();
  const copy = storefront.catalog;
  const cardLabels = { card: storefront.articleCard, price: storefront.price };
  const locale = useLocale();
  const [panelOpen, setPanelOpen] = useState(false);
  const grid = useRef<HTMLUListElement>(null);
  // Set when "Cargar más" (or its retry) is pressed: the first card of the
  // page it asked for takes focus once it lands, since the link may then be
  // gone. It names the selection it was pressed in (another selection's
  // first page is no page it asked for) and the control pressed: focus the
  // visitor took elsewhere meanwhile, the sort say, stays there. A page the
  // scroll loaded moves no focus.
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
    startCursor,
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
      // The pressed control went with the failed page: its retry takes over.
      focusFrom.current = null;
      retry.current?.focus();
    }
  }, [products.isFetchNextPageError, products.items.length, selection]);

  /** Asks for the next page from a control, whose press may move focus. */
  const loadFrom = (trigger: HTMLElement) => {
    focusFrom.current = {
      from: products.items.length,
      selection,
      trigger,
    };
    fetchNextPage();
  };
  // The panel offers the filters' values: only they count on its button,
  // never the page's own category or a search (FER-044).
  const chosenFilters = query.filters.reduce(
    (total, filter) => total + filter.values.length,
    0
  );
  const announcement = loadedAnnouncement(copy, locale, {
    ...products.loaded,
    complete: !products.hasNextPage,
    total: products.items.length,
  });
  const title = (
    <h1 className="font-display store-display-page leading-display font-extrabold wrap-anywhere uppercase">
      {heading}
    </h1>
  );

  return (
    <div
      className="flex w-full flex-col pb-12 text-store-foreground md:pb-18"
      data-slot="store-catalog"
      data-testid="store-catalog"
    >
      <header className="flex flex-col">
        {cover ? (
          <StoreCatalogCover cover={cover}>
            <div className="max-w-[18ch]">{title}</div>
          </StoreCatalogCover>
        ) : null}
        <StoreBreadcrumb
          className={`${GUTTER_CLASS} py-1.5`}
          items={breadcrumb.items}
          label={breadcrumb.label}
        />
        {cover ? null : (
          <div
            className={`${GUTTER_CLASS} flex flex-col items-center pt-4 pb-6 text-center md:pt-6 md:pb-9`}
          >
            {title}
          </div>
        )}
      </header>
      <div
        className={`${GUTTER_CLASS} flex items-center justify-between gap-3 pb-3.5 md:pb-4.5`}
        data-slot="store-catalog-bar"
      >
        <DialogPrimitive.Root onOpenChange={setPanelOpen} open={panelOpen}>
          <DialogPrimitive.Trigger asChild>
            <StoreButton data-testid="store-catalog-filter" variant="outline">
              <SlidersHorizontal aria-hidden="true" />
              {/* The eye reads "Filtrar (2)"; a screen reader hears the
                  whole name, "Filtrar, 2 filtros elegidos". */}
              <span aria-hidden={chosenFilters > 0 ? "true" : undefined}>
                {copy.filter}
                {chosenFilters > 0
                  ? ` (${formatInteger(chosenFilters, locale)})`
                  : null}
              </span>
              {chosenFilters > 0 ? (
                <span className="sr-only">
                  {chosenFilters === 1
                    ? copy.filterCountOne
                    : interpolate(copy.filterCount, {
                        count: formatInteger(chosenFilters, locale),
                      })}
                </span>
              ) : null}
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
            {/* The store's own order is the one nobody chose: the button
                names no sort then (FER-044). Another sort is named, and on
                a phone only it shows; a screen reader hears both. */}
            {query.sort === DEFAULT_PRODUCT_SORT ? (
              <span>{copy.sort.prompt}</span>
            ) : (
              <>
                <span className="sr-only sm:not-sr-only">
                  {copy.sort.label}
                </span>{" "}
                <span className="underline decoration-2 underline-offset-4">
                  {copy.sort[query.sort]}
                </span>
              </>
            )}
            <ChevronDown aria-hidden="true" className="size-4" />
          </DropdownMenuPrimitive.Trigger>
          <DropdownMenuPrimitive.Content
            align="end"
            className="z-30 min-w-60 border-2 border-store-foreground bg-store-background p-1 text-store-foreground shadow-lg outline-none"
            data-testid="store-catalog-sort-menu"
            loop
            sideOffset={6}
          >
            {PRODUCT_SORTS.map((sort) => {
              // The default is never marked: it is what nothing chosen means.
              const chosenSort =
                query.sort === sort && sort !== DEFAULT_PRODUCT_SORT;

              return (
                <DropdownMenuPrimitive.Item asChild key={sort}>
                  <Link
                    aria-current={chosenSort ? "true" : undefined}
                    className="flex min-h-11 items-center justify-between gap-4 px-3 text-sm outline-none data-highlighted:bg-store-foreground data-highlighted:text-store-background"
                    href={href({ ...query, sort })}
                    scroll={false}
                  >
                    {copy.sort[sort]}
                    {chosenSort ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : null}
                  </Link>
                </DropdownMenuPrimitive.Item>
              );
            })}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Root>
      </div>
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
                  href={localizePath(articlePath(item.slug), locale)}
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
        {/* Each page the browser adds is said, politely (an output is a
            polite status), with how many the grid holds now; the end of
            the list too. */}
        <output className="sr-only" data-testid="store-catalog-status">
          {announcement}
        </output>
        {products.isFetchNextPageError ? (
          <div className="flex flex-col items-center gap-3" role="alert">
            <p className="text-sm">{copy.loadFailed}</p>
            <StoreButton
              onClick={(event) => {
                loadFrom(event.currentTarget);
              }}
              ref={retry}
              variant="outline"
            >
              {copy.retry}
            </StoreButton>
          </div>
        ) : null}
        {products.hasNextPage &&
        products.nextCursor &&
        !products.isFetchNextPageError ? (
          // The scroll's sentinel: as it nears the window, the next page
          // loads by itself. Once the list ends it is gone, and so is the
          // pull, so the footer stays within reach.
          <div className="flex justify-center" ref={attachSentinel}>
            {/* A real link to the next page: without the script, or for a
                crawler, it opens it; with the script it loads in place.
                Never disabled: a disabled control drops the keyboard's
                focus to the page. While a page loads, a press does
                nothing. */}
            <StoreButton asChild variant="outline">
              <Link
                aria-busy={products.isFetchingNextPage}
                aria-disabled={products.isFetchingNextPage}
                data-testid="store-catalog-more"
                href={catalogHref(locale, query, products.nextCursor)}
                onClick={(event) => {
                  if (opensElsewhere(event)) {
                    return;
                  }

                  event.preventDefault();

                  if (!products.isFetchingNextPage) {
                    loadFrom(event.currentTarget);
                  }
                }}
                prefetch={false}
                scroll={false}
              >
                {products.isFetchingNextPage ? copy.loading : copy.loadMore}
              </Link>
            </StoreButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * What the status line says once the browser added pages to the server's:
 * how many the last brought and how many the grid holds, and that the
 * list ended. Nothing before the first one: the page itself was read.
 */
function loadedAnnouncement(
  copy: ReturnType<typeof useDictionary>["storefront"]["catalog"],
  locale: ReturnType<typeof useLocale>,
  {
    added,
    complete,
    last,
    total,
  }: { added: number; complete: boolean; last: number; total: number }
) {
  if (added === 0) {
    return "";
  }

  const loaded =
    last === 1
      ? interpolate(copy.loadedOne, { total: formatInteger(total, locale) })
      : interpolate(copy.loaded, {
          count: formatInteger(last, locale),
          total: formatInteger(total, locale),
        });

  return complete ? `${loaded} ${copy.loadedAll}` : loaded;
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

export { StoreCatalog };
