"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { type RefObject, useEffect, useRef } from "react";

import type { FilterChip } from "@/lib/admin/product-filters";
import { useDictionary } from "@/lib/hooks/i18n";
import { interpolate } from "@/lib/i18n/interpolate";
import { cn } from "@/lib/utils";

export interface ProductActiveFiltersProps {
  chips: readonly FilterChip[];
  className?: string;
  /** The list without any filter (`withoutFilters`). */
  clearHref: string;
  /** Where focus goes once the last chip is gone ("Filtros"). */
  fallbackFocus: RefObject<HTMLElement | null>;
  /** The address of a selection. */
  hrefOf: (chip: FilterChip) => string;
}

/**
 * The filters narrowing the article list (FER-019), over it: a quiet pill
 * per value ("Color: Dorado", a color with its swatch), each a link to the
 * list without it, then "Limpiar todo". Removing one moves focus to the
 * first chip left, or to `fallbackFocus` once none is, never to the top of
 * the page. Nothing shows while nothing narrows the list.
 */
function ProductActiveFilters({
  chips,
  className,
  clearHref,
  fallbackFocus,
  hrefOf,
}: ProductActiveFiltersProps) {
  const copy = useDictionary().articles.list.chips;
  const list = useRef<HTMLUListElement>(null);
  // A chip was followed: its link goes once the list arrives.
  const removing = useRef(false);
  const ids = chips.map((chip) => chip.id).join(" ");
  const shown = useRef(ids);

  // Once the chips change after one was followed.
  useEffect(() => {
    if (shown.current === ids) {
      return;
    }

    shown.current = ids;

    if (removing.current) {
      removing.current = false;
      const first = list.current?.querySelector("a");
      (first ?? fallbackFocus.current)?.focus();
    }
  });

  if (chips.length === 0) {
    return null;
  }

  return (
    <ul
      aria-label={copy.label}
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-slot="product-active-filters"
      data-testid="product-active-filters"
      onClickCapture={() => {
        removing.current = true;
      }}
      ref={list}
    >
      {chips.map((chip) => {
        const name = interpolate(copy.value, {
          filter: chip.filter,
          value: chip.value,
        });

        return (
          <li className="max-w-full min-w-0" key={chip.id}>
            <Link
              aria-label={interpolate(copy.remove, { filter: name })}
              className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-full border bg-card pr-2 pl-3 text-xs transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-7 md:pr-1.5 md:pl-2.5"
              href={hrefOf(chip)}
              scroll={false}
            >
              <span className="text-muted-foreground">{chip.filter}:</span>
              {chip.swatchColor ? (
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: chip.swatchColor }}
                />
              ) : null}
              <span className="truncate font-medium">{chip.value}</span>
              <X aria-hidden="true" className="size-3.5 shrink-0" />
            </Link>
          </li>
        );
      })}
      <li>
        <Link
          className="inline-flex h-11 items-center rounded-md px-2 text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-7"
          data-testid="product-filters-clear-all"
          href={clearHref}
          scroll={false}
        >
          {copy.clearAll}
        </Link>
      </li>
    </ul>
  );
}

export { ProductActiveFilters };
