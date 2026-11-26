"use client";

// The head is `block` and its row a grid, which drops a table's implicit
// roles in WebKit: the rowgroup, row and column headers say them outright.
// oxlint-disable jsx-a11y/no-redundant-roles -- redundant only where the display is a table's (4 here)
// oxlint-disable jsx-a11y/no-interactive-element-to-noninteractive-role -- reads `tr` as interactive; `row` is its own role (1 here)

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";

import { PRODUCT_ROW_COLUMNS } from "@/app/_components/molecules/product-list-row";
import {
  type ProductsQuery,
  productsPath,
  sortedBy,
} from "@/lib/admin/products";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import type { StoreProductSort } from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

export interface ProductListHeadProps {
  /**
   * The list's selection in the address, already read, in the order of the
   * rows the header is over: the header names it and its links start from
   * it.
   */
  query: ProductsQuery;
}

/** The sortable columns, in the row's order, and which align right. */
const COLUMNS: readonly { align?: "right"; sort: StoreProductSort }[] = [
  { sort: "title" },
  { sort: "category" },
  { align: "right", sort: "price" },
  { sort: "status" },
  { sort: "updated" },
];

/**
 * The article list's column names from `xl` up (FER-019), Vercel's way:
 * small and muted, each a link that sorts by its column (from the first
 * page), the column sorting now in the foreground with an arrow for its
 * direction, a second click turning it round. The header says the order
 * (`aria-sort`); the link's name says what following it does ("Ordenar:
 * Precio, de menor a mayor"). Below `xl` the rows are cards with no
 * columns, and "Ordenar" offers the same orders (`product-sort-menu`).
 */
function ProductListHead({ query }: ProductListHeadProps) {
  const copy = useDictionary().articles.list;
  const locale = useLocale();
  const names: Record<StoreProductSort, string> = {
    category: copy.columns.category,
    price: copy.columns.price,
    status: copy.columns.status,
    title: copy.columns.article,
    updated: copy.columns.updated,
  };

  return (
    <thead
      className="hidden border-b bg-muted/50 xl:block"
      data-slot="product-list-head"
      data-testid="product-list-columns"
      role="rowgroup"
    >
      <tr
        role="row"
        className={cn(
          "grid h-10 items-center gap-x-4 px-4 text-xs text-muted-foreground",
          PRODUCT_ROW_COLUMNS
        )}
      >
        <th className="font-normal" role="columnheader" scope="col">
          <span className="sr-only">{copy.columns.photo}</span>
        </th>
        {COLUMNS.map(({ align, sort }) => {
          const active = query.sort === sort;
          const next = sortedBy(query, sort);
          let Arrow = ChevronsUpDown;

          if (active) {
            Arrow = query.dir === "asc" ? ArrowUp : ArrowDown;
          }

          let order: "ascending" | "descending" | "none" = "none";

          if (active) {
            order = query.dir === "asc" ? "ascending" : "descending";
          }

          return (
            <th
              aria-sort={order}
              className={cn(
                "text-left font-normal",
                align === "right" && "text-right"
              )}
              key={sort}
              role="columnheader"
              scope="col"
            >
              <Link
                aria-label={interpolate(copy.sort.apply, {
                  option: copy.sort.options[sort][next.dir],
                })}
                className={cn(
                  "group -mx-1.5 inline-flex h-8 items-center gap-1 rounded-md px-1.5 transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active && "font-medium text-foreground"
                )}
                data-testid={`sort-${sort}`}
                href={productsPath(locale, next)}
                scroll={false}
              >
                {names[sort]}
                <Arrow
                  aria-hidden="true"
                  className={cn(
                    "size-3.5",
                    !active &&
                      "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  )}
                />
              </Link>
            </th>
          );
        })}
        <th className="font-normal" role="columnheader" scope="col">
          <span className="sr-only">{copy.columns.actions}</span>
        </th>
      </tr>
    </thead>
  );
}

export { ProductListHead };
