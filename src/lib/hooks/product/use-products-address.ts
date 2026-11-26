import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { type ProductsQuery, productsPath } from "@/lib/admin/products";
import type { Locale } from "@/lib/i18n/config";
import { SEARCH_MAX_LENGTH } from "@/lib/schemas/catalog";
import { readSearchText } from "@/lib/schemas/search";

/** A change to the list's selection, made on the newest one asked for. */
export type ProductsQueryChange = (base: ProductsQuery) => ProductsQuery;

/** What the controls ask the list's address for (`useProductsAddress`). */
export interface ProductsAddress {
  /** Asks for `change` as a new history entry ("Aplicar"). */
  push: (change: ProductsQueryChange) => void;
  /** Asks for `change` in place of this entry (the search as it is typed). */
  replace: (change: ProductsQueryChange) => void;
}

/**
 * The one place the article list's controls change its address through
 * (FER-056). A navigation takes a moment to commit, and the controls render
 * the address as it was until it does: one that built the address from what
 * it rendered would drop a change another control asked for meanwhile (the
 * search's wait ending while "Aplicar" commits, or the other way round).
 * Here each change is made on the newest selection asked for, so whichever
 * commits last holds both. An address the list did not ask for (back,
 * forward, a link) is the selection from then on, and the changes asked for
 * before it are forgotten.
 */
export function useProductsAddress(
  query: ProductsQuery,
  locale: Locale
): ProductsAddress {
  const router = useRouter();
  const here = productsPath(locale, query);
  // The newest selection asked for, and the addresses asked for that the
  // list has not shown yet, oldest first.
  const latest = useRef(query);
  const asked = useRef<string[]>([]);
  const seen = useRef(here);

  useEffect(() => {
    if (seen.current === here) {
      return;
    }

    seen.current = here;

    // The newest address asked for arriving: every one asked for before it
    // is superseded (the router keeps the last navigation), even one with
    // the same address, so none stays to pass for this list's own later.
    if (here === asked.current.at(-1)) {
      asked.current = [];
      return;
    }

    const own = asked.current.indexOf(here);

    if (own === -1) {
      latest.current = query;
      asked.current = [];
    } else {
      // Its own navigation arriving: a newer one asked for may still come.
      asked.current = asked.current.slice(own + 1);
    }
  });

  const go = (change: ProductsQueryChange, method: "push" | "replace") => {
    const changed = change(latest.current);
    // The search as the page will read it back (`readProductsQuery`), so its
    // address is recognised as this list's own when it arrives.
    const next = {
      ...changed,
      q: readSearchText(changed.q, SEARCH_MAX_LENGTH),
    };
    const path = productsPath(locale, next);

    if (path === productsPath(locale, latest.current)) {
      return;
    }

    latest.current = next;
    // Back to the address shown: the router keeps only the last navigation,
    // so the ones asked for before it never arrive, and this one shows
    // nothing new. None stays to pass for this list's own later (back to
    // one of them is an address from elsewhere).
    asked.current = path === seen.current ? [] : [...asked.current, path];
    router[method](path, { scroll: false });
  };

  return {
    push: (change) => {
      go(change, "push");
    },
    replace: (change) => {
      go(change, "replace");
    },
  };
}
