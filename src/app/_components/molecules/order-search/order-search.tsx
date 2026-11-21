"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Input } from "@/app/_components/atoms/input";
import { type OrdersQuery, ordersPath } from "@/lib/admin/orders";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { useSearchField } from "@/lib/hooks/ui";
import { ORDER_SEARCH_MAX_LENGTH } from "@/lib/schemas/order";
import { cn } from "@/lib/utils";

/** How long typing pauses before the address follows it. */
export { SEARCH_DEBOUNCE_MS as ORDER_SEARCH_DEBOUNCE_MS } from "@/lib/hooks/ui";

export interface OrderSearchProps {
  className?: string;
  query: OrdersQuery;
}

/**
 * The orders screen's search by code, name or phone (FER-027), the
 * storefront search's behavior in the admin's style: the address follows
 * what is typed once typing pauses, replacing the history entry, and keeps
 * the status the address holds by then (`useSearchField`); the field stays
 * mounted while the list changes, so it keeps focus. Before the script loads
 * it is a plain GET form that keeps the status.
 */
function OrderSearch({ className, query }: OrderSearchProps) {
  const copy = useDictionary().admin.orders;
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchField(query.q, (q) => {
    router.replace(ordersPath(locale, { q, status: query.status }), {
      scroll: false,
    });
  });

  return (
    <search className={cn("block", className)} data-slot="order-search">
      <form
        action={ordersPath(locale)}
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          search.submit();
        }}
      >
        {query.status ? (
          <input name="status" type="hidden" value={query.status} />
        ) : null}
        <label className="sr-only" htmlFor="order-search">
          {copy.search}
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          autoComplete="off"
          className="bg-card pl-9"
          enterKeyHint="search"
          id="order-search"
          maxLength={ORDER_SEARCH_MAX_LENGTH}
          name="q"
          onChange={(event) => {
            search.change(event.target.value);
          }}
          placeholder={copy.searchPlaceholder}
          type="search"
          value={search.value}
        />
      </form>
    </search>
  );
}

export { OrderSearch };
