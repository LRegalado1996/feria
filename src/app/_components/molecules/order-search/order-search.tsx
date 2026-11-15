"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/app/_components/atoms/input";
import { type OrdersQuery, ordersPath } from "@/lib/admin/orders";
import { useDictionary, useLocale } from "@/lib/hooks/i18n";
import { ORDER_SEARCH_MAX_LENGTH } from "@/lib/schemas/order";
import { cn } from "@/lib/utils";

/** How long typing pauses before the address follows it. */
export const ORDER_SEARCH_DEBOUNCE_MS = 300;

export interface OrderSearchProps {
  className?: string;
  query: OrdersQuery;
  storeSlug: string;
}

/**
 * The orders screen's search by code, name or phone (FER-027), the
 * storefront search's behavior in the admin's style: the address follows
 * what is typed once typing pauses, replacing the history entry; the field
 * stays mounted while the list changes, so it keeps focus; a search the
 * address brings from elsewhere (the back button) replaces what it shows.
 * Before the script loads it is a plain GET form that keeps the status.
 */
function OrderSearch({ className, query, storeSlug }: OrderSearchProps) {
  const copy = useDictionary().admin.orders;
  const locale = useLocale();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A search still waiting when the field goes away would navigate back to
  // the screen it left: the pending timer is the work this cleans up.
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
  // a new one in the address that this field sent is its own navigation
  // catching up; any other came from elsewhere and replaces the field.
  const [seen, setSeen] = useState(query.q);
  const [sent, setSent] = useState<(string | undefined)[]>([]);
  const [replaced, setReplaced] = useState(0);

  if (query.q !== seen) {
    const own = sent.indexOf(query.q);
    setSeen(query.q);
    setSent(own === -1 ? [] : sent.slice(own + 1));

    if (own === -1) {
      setValue(query.q ?? "");
      setReplaced((count) => count + 1);
    }
  }

  // A search from elsewhere replaced the field: one this field was still
  // waiting to send would navigate away from it, so it goes.
  useEffect(() => {
    if (replaced > 0 && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, [replaced]);

  const go = (typed: string) => {
    const q = typed.trim() === "" ? undefined : typed.trim();
    setSent((previous) => [...previous, q]);
    router.replace(ordersPath(storeSlug, locale, { q, status: query.status }), {
      scroll: false,
    });
  };

  return (
    <search className={cn("block", className)} data-slot="order-search">
      <form
        action={ordersPath(storeSlug, locale)}
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();

          if (timer.current) {
            clearTimeout(timer.current);
          }

          go(value);
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
          className="h-11 pl-9 md:h-9"
          enterKeyHint="search"
          id="order-search"
          maxLength={ORDER_SEARCH_MAX_LENGTH}
          name="q"
          onChange={(event) => {
            const typed = event.target.value;
            setValue(typed);

            if (timer.current) {
              clearTimeout(timer.current);
            }

            timer.current = setTimeout(() => {
              go(typed);
            }, ORDER_SEARCH_DEBOUNCE_MS);
          }}
          placeholder={copy.searchPlaceholder}
          type="search"
          value={value}
        />
      </form>
    </search>
  );
}

export { OrderSearch };
