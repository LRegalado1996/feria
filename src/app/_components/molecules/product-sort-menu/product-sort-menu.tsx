"use client";

import { ArrowUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";

import { Button } from "@/app/_components/atoms/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/app/_components/molecules/dropdown-menu";
import { type ProductsQuery, productsPath } from "@/lib/admin/products";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  STORE_PRODUCT_SORT_DIRECTIONS,
  STORE_PRODUCT_SORTS,
  type SortDirection,
  type StoreProductSort,
} from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

export interface ProductSortMenuProps {
  className?: string;
  /** The list's selection in the address, already read. */
  query: ProductsQuery;
}

/** Every order the list has: each column, its first direction first. */
const OPTIONS = STORE_PRODUCT_SORTS.flatMap((sort) => {
  const first = STORE_PRODUCT_SORT_DIRECTIONS[sort];
  const other: SortDirection = first === "asc" ? "desc" : "asc";

  return [first, other].map((dir) => ({ dir, sort, value: `${sort}:${dir}` }));
});

/**
 * The article list's order on a phone and a tablet (FER-019), where the
 * rows are cards without column names: "Ordenar", outlined like "Filtros"
 * beside it, opens a menu of every order, the current one checked. Choosing
 * one puts it in the address from the first page. The button's description
 * says the current order.
 */
function ProductSortMenu({ className, query }: ProductSortMenuProps) {
  const copy = useDictionary().articles.list.sort;
  const locale = useLocale();
  const router = useRouter();
  const describedBy = useId();
  const current = (sort: StoreProductSort, dir: SortDirection) =>
    copy.options[sort][dir];

  return (
    <div className={cn("contents", className)} data-slot="product-sort-menu">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-describedby={describedBy}
            data-testid="product-sort-button"
            size="sm"
            type="button"
            variant="outline"
          >
            <ArrowUpDown aria-hidden="true" />
            {copy.button}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              // Radix answers any string: only a listed order navigates.
              const chosen = OPTIONS.find((option) => option.value === value);

              if (chosen) {
                router.push(
                  productsPath(locale, {
                    ...query,
                    dir: chosen.dir,
                    page: 1,
                    sort: chosen.sort,
                  }),
                  { scroll: false }
                );
              }
            }}
            value={`${query.sort}:${query.dir}`}
          >
            {OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {current(option.sort, option.dir)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" id={describedBy}>
        {interpolate(copy.current, {
          option: current(query.sort, query.dir),
        })}
      </span>
    </div>
  );
}

export { ProductSortMenu };
