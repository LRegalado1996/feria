"use client";

import { Search, X } from "lucide-react";
import { useRef } from "react";

import { Input } from "@/app/_components/atoms/input";
import { type ProductsQuery, productsPath } from "@/lib/admin/products";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import type { ProductsAddress } from "@/lib/hooks/product";
import { useSearchField } from "@/lib/hooks/ui";
import { SEARCH_MAX_LENGTH } from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

export interface ProductSearchProps {
  /** The list's address, which the search asks for its change. */
  address: ProductsAddress;
  className?: string;
  /** The list's selection in the address, already read. */
  query: ProductsQuery;
}

/**
 * The article list's search by title (FER-019), in either language: a
 * field with a magnifier and, once it holds text, a button that clears it.
 * The address follows what is typed once typing pauses, replacing the
 * history entry (`useSearchField`), from the first page and keeping the
 * filters and the order asked for by then, even those still on their way
 * (`useProductsAddress`). Before the script loads it is a plain GET form
 * carrying them.
 */
function ProductSearch({ address, className, query }: ProductSearchProps) {
  const copy = useDictionary().articles.list.search;
  const locale = useLocale();
  const field = useRef<HTMLInputElement>(null);
  const search = useSearchField(query.q ?? undefined, (q) => {
    address.replace((base) => ({ ...base, page: 1, q: q ?? null }));
  });
  // The rest of the selection, for the form a browser without the script
  // sends.
  const kept = new URLSearchParams(
    productsPath(locale, { ...query, page: 1, q: null }).split("?")[1] ?? ""
  );

  return (
    <search
      className={cn("block min-w-0", className)}
      data-slot="product-search"
    >
      <form
        action={productsPath(locale)}
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          search.submit();
        }}
      >
        {[...kept].map(([name, value]) => (
          <input key={name} name={name} type="hidden" value={value} />
        ))}
        <label className="sr-only" htmlFor="product-search">
          {copy.label}
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoComplete="off"
          className="pr-11 pl-9 md:pr-9 [&::-webkit-search-cancel-button]:appearance-none"
          enterKeyHint="search"
          id="product-search"
          maxLength={SEARCH_MAX_LENGTH}
          name="q"
          onChange={(event) => {
            search.change(event.target.value);
          }}
          placeholder={copy.placeholder}
          ref={field}
          type="search"
          value={search.value}
        />
        {search.value === "" ? null : (
          <button
            className="absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 md:size-9"
            onClick={() => {
              search.clear();
              // The button goes with the text: focus stays in the field.
              field.current?.focus();
            }}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">{copy.clear}</span>
          </button>
        )}
      </form>
    </search>
  );
}

export { ProductSearch };
