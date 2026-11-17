import { Search } from "lucide-react";

import type { Dictionary } from "@/content";
import type { Locale } from "@/lib/i18n/config";
import { localizePath } from "@/lib/i18n/paths";
import { SEARCH_MAX_LENGTH } from "@/lib/schemas/catalog";
import { cn } from "@/lib/utils";

export interface StoreSearchFormProps {
  className?: string;
  copy: Dictionary["storefront"]["shell"];
  /** Unique on the page: the header and the phone menu each have one. */
  id: string;
  locale: Locale;
}

/**
 * The search entry: a plain form that opens the store's catalog with `?q=`,
 * so it works before the page hydrates and leaves a shareable address.
 */
function StoreSearchForm({
  className,
  copy,
  id,
  locale,
}: StoreSearchFormProps) {
  return (
    <search className={cn("block", className)} data-slot="store-search-form">
      <form
        action={localizePath("/products", locale)}
        className="flex items-stretch"
        data-testid="store-search-form"
        method="get"
      >
        <label className="sr-only" htmlFor={id}>
          {copy.search}
        </label>
        <input
          autoComplete="off"
          className="h-11 min-w-0 flex-1 border-2 border-store-contrast bg-store-background px-3 text-base text-store-foreground placeholder:text-store-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
          enterKeyHint="search"
          id={id}
          maxLength={SEARCH_MAX_LENGTH}
          name="q"
          placeholder={copy.searchPlaceholder}
          type="search"
        />
        <button
          aria-label={copy.searchSubmit}
          className="flex size-11 shrink-0 items-center justify-center bg-store-contrast text-store-background hover:bg-store-accent hover:text-store-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-store-foreground"
          type="submit"
        >
          <Search aria-hidden="true" className="size-5" />
        </button>
      </form>
    </search>
  );
}

export { StoreSearchForm };
