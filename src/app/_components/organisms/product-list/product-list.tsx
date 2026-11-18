"use client";

import { Plus, Tag } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { Button } from "@/app/_components/atoms/button";
import { Skeleton } from "@/app/_components/atoms/skeleton";
import { AdminPage } from "@/app/_components/molecules/admin-page";
import { EmptyState } from "@/app/_components/molecules/empty-state";
import {
  PRODUCT_ROW_COLUMNS,
  ProductListRow,
} from "@/app/_components/molecules/product-list-row";
import { newProductPath, productPath } from "@/lib/admin/products";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useProducts } from "@/lib/hooks/product";
import { cn } from "@/lib/utils";

/**
 * The store's articles (FER-017): drafts and published, the most recently
 * changed first, a page at a time with "Cargar más", each row opening the
 * wizard on it, and "Nuevo artículo" as the screen's main action (under the
 * thumb on a phone). A card per article on a phone, one card of rows under
 * their column names from `md` up. FER-019 adds search, filters and quick
 * edits on top of it.
 */
function ProductList() {
  const { articles, common } = useDictionary();
  const copy = articles.list;
  const locale = useLocale();
  const products = useProducts();
  const items = products.data?.pages.flatMap((page) => page.items);
  const currency = products.data?.pages[0]?.currencyCode ?? "UYU";
  const list = useRef<HTMLUListElement>(null);
  // The first row a "Cargar más" brought, to focus once it shows.
  const focusRow = useRef<number | null>(null);
  const rowCount = items?.length ?? 0;

  useEffect(() => {
    const row = focusRow.current;

    if (row !== null && rowCount > row) {
      list.current?.querySelectorAll("a")[row]?.focus();
      focusRow.current = null;
    }
  }, [rowCount]);

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
        {products.isPending ? (
          <div
            aria-busy="true"
            className="space-y-2"
            data-testid="product-list-skeleton"
          >
            <span className="sr-only">{common.loading}</span>
            {["first", "second", "third"].map((row) => (
              <Skeleton className="h-24 w-full rounded-lg md:h-16" key={row} />
            ))}
          </div>
        ) : null}
        {products.isError && !products.isFetchNextPageError ? (
          <div
            className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground"
            role="alert"
          >
            <p className="text-sm">{copy.errors.load}</p>
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
        ) : null}
        {items?.length === 0 ? (
          <EmptyState
            className="rounded-lg border bg-card px-6"
            icon={Tag}
            message={copy.empty}
          />
        ) : null}
        {items && items.length > 0 ? (
          <div className="md:overflow-hidden md:rounded-lg md:border md:bg-card">
            <div
              aria-hidden
              className={cn(
                "hidden h-10 items-center gap-x-4 border-b bg-muted/50 px-4 text-xs text-muted-foreground md:grid",
                PRODUCT_ROW_COLUMNS
              )}
              data-testid="product-list-columns"
            >
              <span />
              <span>{copy.columns.article}</span>
              <span>{copy.columns.category}</span>
              <span className="text-right">{copy.columns.price}</span>
              <span>{copy.columns.status}</span>
            </div>
            <ul
              aria-label={copy.label}
              className="space-y-2 md:space-y-0 md:divide-y"
              data-testid="product-list-rows"
              ref={list}
            >
              {items.map((item) => (
                <ProductListRow
                  copy={copy}
                  currency={currency}
                  href={productPath(item.id, locale)}
                  item={item}
                  key={item.id}
                  locale={locale}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {products.isFetchNextPageError ? (
          <p className="text-sm" role="alert">
            {copy.errors.loadMore}
          </p>
        ) : null}
        {products.hasNextPage ? (
          <Button
            aria-disabled={products.isFetchingNextPage || undefined}
            className="w-full aria-disabled:opacity-50 md:w-auto"
            onClick={() => {
              if (!products.isFetchingNextPage) {
                focusRow.current = rowCount;
                void products.fetchNextPage();
              }
            }}
            type="button"
            variant="outline"
          >
            {products.isFetchingNextPage ? copy.loadingMore : copy.loadMore}
          </Button>
        ) : null}
      </AdminPage>
    </section>
  );
}

export { ProductList };
