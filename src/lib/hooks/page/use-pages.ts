import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The key of the pages' list, for the writes beside it. */
export function pagesKey() {
  return orpc.page.list.key();
}

/**
 * The store's pages for the admin's list (FER-060): the home first, each
 * with its address, names, status and place in the header.
 */
export function usePages() {
  return useQuery(orpc.page.list.queryOptions());
}

/** What `page.list` answers: one row per page. */
export type PageRow = NonNullable<ReturnType<typeof usePages>["data"]>[number];
