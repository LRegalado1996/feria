"use client";

import { ORPCError } from "@orpc/client";
import { Plus, SearchX, Tag } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import { ConfirmDialog } from "@/app/_components/molecules/confirm-dialog";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import { Pagination } from "@/app/_components/molecules/pagination";
import { ProductActiveFilters } from "@/app/_components/molecules/product-active-filters";
import { ProductFilterPanel } from "@/app/_components/molecules/product-filter-panel";
import { ProductListHead } from "@/app/_components/molecules/product-list-head";
import {
  type ProductListItem,
  ProductListRow,
} from "@/app/_components/molecules/product-list-row";
import { ProductRowMenu } from "@/app/_components/molecules/product-row-menu";
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
import { readPublishRefusal } from "@/lib/catalog/publish-gaps";
import { reportError } from "@/lib/errors/client";
import { useStoreAttributes } from "@/lib/hooks/attribute";
import { useStoreCategories } from "@/lib/hooks/category";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import {
  type ProductsPage,
  useDeleteProduct,
  useProducts,
  usePublishProduct,
  useUnpublishProduct,
} from "@/lib/hooks/product";
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

/**
 * Whether a read failed with nothing read before it to show: a list the
 * filter panel must say failed, with a retry, rather than show as empty.
 */
function failedUnread(read: { data: unknown; isError: boolean }): boolean {
  return read.isError && read.data === undefined;
}

/**
 * Whether focus is where a person waiting on the pages leaves it: on the
 * body (which the foot's link left while the page came), in the table or in
 * the foot.
 */
function waitsOnPages(
  table: HTMLElement | null,
  foot: HTMLElement | null
): boolean {
  const active = document.activeElement;

  return (
    active === null ||
    active === document.body ||
    (table?.contains(active) ?? false) ||
    (foot?.contains(active) ?? false)
  );
}

/**
 * The four states a read can be in before it has rows to show. An earlier
 * selection's answer kept on screen while this one's comes holds its rows,
 * marked busy; one without rows (a search that matched nothing, cleared)
 * has none to hold, so the skeleton stands in for them.
 */
function ReadState({
  products,
}: {
  products: Pick<
    ReturnType<typeof useProducts>,
    "data" | "isError" | "isPending" | "isPlaceholderData" | "refetch"
  >;
}) {
  const { articles, common } = useDictionary();

  if (
    products.isPending ||
    (products.isPlaceholderData && products.data?.items.length === 0)
  ) {
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
 * (under the thumb on a phone). Each row's menu hides a published article
 * from the store (a draft again) or publishes a draft, at once, or deletes
 * the article after asking; each ends in a toast, and focus goes back to
 * the menu, or to the table once the row is gone.
 */
function ProductList({ query, renderedAt }: ProductListProps) {
  const copy = useDictionary().articles.list;
  const locale = useLocale();
  const now = useNow(renderedAt);
  const products = useProducts(productsListInput(query, locale));
  // `undefined` until read: the filter panel keeps the address's selection
  // rather than drop it as unknown to a list it has not got.
  const categoriesRead = useStoreCategories();
  const categories = categoriesRead.data;
  const attributesRead = useStoreAttributes();
  const attributes = attributesRead.data;
  const page = products.data;
  const filtersButton = useRef<HTMLButtonElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  const rangeId = useId();
  // The address a step of the pages led to: that page takes focus once it
  // shows, and no other selection does.
  const paging = useRef<string | null>(null);
  const here = productsPath(locale, query);
  const actions = useDictionary().articles.list.actions;
  const publish = usePublishProduct();
  const unpublish = useUnpublishProduct();
  const remove = useDeleteProduct();
  // Each question is its own object: a delete that ends after its question
  // was closed, or another one opened, leaves the open one alone.
  const [deleting, setDeleting] = useState<{ item: ProductListItem } | null>(
    null
  );
  // The rows whose visibility is on its way, each on its own.
  const [switching, setSwitching] = useState<ReadonlySet<number>>(
    () => new Set()
  );
  const opener = useRef<HTMLButtonElement | null>(null);
  // A menu whose row may leave the list once it is read again.
  const leaving = useRef<HTMLButtonElement | null>(null);

  /**
   * Where focus goes after a row's action: its menu while the row is
   * there, the table once it is gone, "Filtros" once the table is too (the
   * last row deleted or hidden from a filtered list).
   */
  const settleFocus = (button: HTMLButtonElement | null) => {
    if (button?.isConnected) {
      button.focus();
    } else if (table.current?.isConnected) {
      table.current.focus();
    } else {
      filtersButton.current?.focus();
    }
  };

  /** A menu whose row went with the list's new answer hands focus on. */
  const settleLeaving = () => {
    const button = leaving.current;

    if (button === null || button.isConnected) {
      return;
    }

    leaving.current = null;

    // Only focus that was lost with the row: a person who moved on keeps it.
    if (
      document.activeElement === null ||
      document.activeElement === document.body
    ) {
      settleFocus(null);
    }
  };

  const titleOf = (item: ProductListItem) => item.title ?? copy.untitled;

  const hideArticle = async (item: ProductListItem) => {
    try {
      await unpublish.mutateAsync({ id: item.id });
      toast.success(actions.hidden);
    } catch (error) {
      reportError(error, { action: "Products.hide_product" });
      toast.error(actions.errors.hide);
    }
  };

  const showArticle = async (item: ProductListItem) => {
    try {
      await publish.mutateAsync({ id: item.id });
      toast.success(actions.shown);
    } catch (error) {
      // A draft that still lacks something is refused on purpose: the
      // wizard says what; here, to open it.
      if (
        error instanceof ORPCError &&
        error.code === "BAD_REQUEST" &&
        readPublishRefusal(error.message) !== null
      ) {
        toast.error(actions.errors.incomplete);
      } else {
        reportError(error, { action: "Products.show_product" });
        toast.error(actions.errors.show);
      }
    }
  };

  const toggleVisibility = async (
    item: ProductListItem,
    button: HTMLButtonElement
  ) => {
    setSwitching((ids) => new Set([...ids, item.id]));
    await (item.status === "published" ? hideArticle(item) : showArticle(item));
    setSwitching((ids) => new Set([...ids].filter((id) => id !== item.id)));
    // The list is read again by now; it shows on the next render, which
    // may leave this row out (a status filter, another page).
    leaving.current = button;
    settleLeaving();
  };

  const deleteArticle = async (asked: { item: ProductListItem }) => {
    try {
      await remove.mutateAsync({ id: asked.item.id });
      toast.success(actions.deleted);
    } catch (error) {
      reportError(error, { action: "Products.delete_product" });
      toast.error(actions.errors.delete);
    }

    setDeleting((open) => (open === asked ? null : open));
  };

  const focusBack = (event: Event) => {
    event.preventDefault();
    settleFocus(opener.current);
  };
  // An earlier selection's answer, shown while this one's is on its way
  // (`keepPreviousData`): its rows stay, marked busy, but its count, its
  // empty state and its pages are not this selection's to show.
  const settled = products.isPlaceholderData ? undefined : page;
  const shownPage = settled?.page ?? null;

  // After each render, a row that left with the list's new answer took its
  // menu: focus moves on (a ref read, nothing more, until one did).
  useEffect(() => {
    settleLeaving();
  });

  useEffect(() => {
    if (paging.current === null) {
      return;
    }

    // Another selection replaced the step's before it showed: disarmed at
    // once, even while that one's answer is still on its way or never
    // comes, so the step's page reached later another way takes no focus.
    if (paging.current !== here) {
      paging.current = null;
      return;
    }

    if (shownPage === null) {
      return;
    }

    // Disarmed even when the page has no table (past the end). Focus moves
    // only while the person still waits on the pages: one who went on to
    // the search keeps typing there.
    if (waitsOnPages(table.current, foot.current)) {
      table.current?.focus();
    }

    paging.current = null;
  }, [here, shownPage]);

  const chips = activeFilterChips(query, {
    attributes: attributes ?? [],
    categories: categories ?? [],
    copy,
    locale,
  });
  const summary = settled ? summaryOf(settled, copy, locale) : null;
  const hasTable = page !== undefined && page.items.length > 0;

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
                attributesFailed={failedUnread(attributesRead)}
                categories={categories}
                categoriesFailed={failedUnread(categoriesRead)}
                onRetryAttributes={() => {
                  void attributesRead.refetch();
                }}
                onRetryCategories={() => {
                  void categoriesRead.refetch();
                }}
                query={query}
                ref={filtersButton}
              />
              {/* From `xl` up the table's headers sort; without a table
                  (no matches, past the last page) "Ordenar" stays. */}
              <ProductSortMenu
                className={hasTable ? "xl:hidden" : undefined}
                query={query}
              />
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
          {settled && settled.items.length === 0 ? (
            <NoRows page={settled} query={query} />
          ) : null}
          {hasTable ? (
            <table
              aria-busy={products.isPlaceholderData || undefined}
              aria-describedby={rangeId}
              aria-label={copy.label}
              className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring xl:overflow-hidden xl:border xl:bg-card"
              data-testid="product-list-table"
              ref={table}
              // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- `block` drops a table's implicit roles in WebKit, so they are said outright (rows and cells: `product-list-row`)
              role="table"
              tabIndex={-1}
            >
              {/* The rows' own order: while another order's page comes,
                  the header still names the one on screen. */}
              <ProductListHead
                query={{ ...query, dir: page.dir, sort: page.sort }}
              />
              <tbody
                className="block space-y-2 xl:space-y-0 xl:divide-y"
                data-testid="product-list-rows"
                // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- `block`, as the table's
                role="rowgroup"
              >
                {page.items.map((item) => (
                  <ProductListRow
                    actions={
                      <ProductRowMenu
                        onDelete={(button) => {
                          opener.current = button;
                          setDeleting({ item });
                        }}
                        onToggleVisibility={(button) => {
                          void toggleVisibility(item, button);
                        }}
                        published={item.status === "published"}
                        switching={switching.has(item.id)}
                        title={titleOf(item)}
                      />
                    }
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
          {settled && summary && settled.total > 0 ? (
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1"
              data-testid="product-list-foot"
              ref={foot}
              onClickCapture={(event) => {
                const link = followedLink(event);

                // The current page's own link changes nothing either.
                const destination = link?.getAttribute("href") ?? null;

                if (destination !== null && destination !== here) {
                  paging.current = destination;
                }
              }}
            >
              <p
                className="text-xs text-muted-foreground tabular-nums"
                data-testid="product-list-range"
                id={rangeId}
              >
                {settled.items.length > 0 ? summary.range : null}
              </p>
              <Pagination
                hrefFor={(number) =>
                  productsPath(locale, { ...query, page: number })
                }
                page={query.page}
                pageCount={settled.pageCount}
              />
            </div>
          ) : null}
        </div>
      </AdminPage>
      <ConfirmDialog
        confirmLabel={actions.deleteConfirm}
        description={interpolate(actions.deleteDescription, {
          title: deleting ? titleOf(deleting.item) : "",
        })}
        isPending={remove.isPending}
        onCloseAutoFocus={focusBack}
        onConfirm={() => {
          if (deleting) {
            void deleteArticle(deleting);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
        open={deleting !== null}
        pendingLabel={actions.deletePending}
        title={actions.deleteTitle}
      />
    </section>
  );
}

export { ProductList };
