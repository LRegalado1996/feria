"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { type CatalogQuery, catalogHref } from "@/lib/catalog/query";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { localizePath } from "@/lib/i18n/paths";
import { SEARCH_MAX_LENGTH } from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

/** How long typing pauses before the address follows it. */
export const SEARCH_DEBOUNCE_MS = 300;

export interface StoreCatalogSearchProps {
  className?: string;
  query: CatalogQuery;
  storeSlug: string;
}

/**
 * The catalog's search (FER-023): the address follows what is typed once
 * typing pauses, replacing the history entry so the back button skips the
 * keystrokes. The field stays mounted while the results change, so it keeps
 * focus; a search the address brings from elsewhere (the back button)
 * replaces what it shows.
 */
function StoreCatalogSearch({
  className,
  query,
  storeSlug,
}: StoreCatalogSearchProps) {
  const copy = useDictionary().storefront.catalog;
  const locale = useLocale();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A search still waiting when the field goes away (a card opened, or a
  // chip that remounts it) would navigate back to the old selection, so it
  // is dropped; the pending timer is the external work this cleans up.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );
  const [value, setValue] = useState(query.q ?? "");
  // The search the address last brought, and the ones this field sent since:
  // a new search in the address that is one of them is this field's own
  // navigation catching up (typing may have run ahead of it); any other came
  // from elsewhere (the back button) and replaces what the field shows.
  const [seen, setSeen] = useState(query.q);
  const [sent, setSent] = useState<(string | null)[]>([]);
  // Counts the searches that came from elsewhere, so the effect below can
  // drop a search of this field's own that was still waiting.
  const [replaced, setReplaced] = useState(0);

  if (query.q !== seen) {
    const own = sent.indexOf(query.q);
    setSeen(query.q);
    // Searches sent after this one are still on their way.
    setSent(own === -1 ? [] : sent.slice(own + 1));

    if (own === -1) {
      setValue(query.q ?? "");
      setReplaced((count) => count + 1);
    }
  }

  // A search from elsewhere (the back button) replaced the field: a search
  // it was still waiting to send would navigate away from it, so it goes.
  useEffect(() => {
    if (replaced > 0 && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, [replaced]);

  const go = (typed: string) => {
    const q = typed.trim() === "" ? null : typed.trim();
    setSent((previous) => [...previous, q]);
    router.replace(catalogHref(storeSlug, locale, { ...query, q }), {
      scroll: false,
    });
  };

  return (
    <search className={cn("block", className)} data-slot="store-catalog-search">
      <form
        action={localizePath(`/${storeSlug}/products`, locale)}
        className="flex items-stretch"
        onSubmit={(event) => {
          event.preventDefault();

          if (timer.current) {
            clearTimeout(timer.current);
          }

          go(value);
        }}
      >
        {/* Before the script loads, the form itself carries the rest of
            the selection, so a search keeps the category and filters. */}
        {query.category ? (
          <input name="category" type="hidden" value={query.category} />
        ) : null}
        {query.filters.map((filter) => (
          <input
            key={filter.attribute}
            name={filter.attribute}
            type="hidden"
            value={filter.values.join(",")}
          />
        ))}
        {query.sort === "newest" ? null : (
          <input name="sort" type="hidden" value={query.sort} />
        )}
        <label className="sr-only" htmlFor="store-catalog-search">
          {copy.search}
        </label>
        <input
          autoComplete="off"
          className="h-11 min-w-0 flex-1 border-2 border-store-contrast bg-store-background px-3 text-base text-store-foreground placeholder:text-store-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
          enterKeyHint="search"
          id="store-catalog-search"
          maxLength={SEARCH_MAX_LENGTH}
          name="q"
          onChange={(event) => {
            const typed = event.target.value;
            setValue(typed);

            if (timer.current) {
              clearTimeout(timer.current);
            }

            timer.current = setTimeout(() => {
              go(typed);
            }, SEARCH_DEBOUNCE_MS);
          }}
          placeholder={copy.searchPlaceholder}
          type="search"
          value={value}
        />
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center bg-store-contrast text-store-background"
        >
          <Search className="size-5" />
        </span>
      </form>
    </search>
  );
}

export { StoreCatalogSearch };
