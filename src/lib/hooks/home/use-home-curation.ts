import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of the home's curation, for the writes beside it. */
export function homeCurationKey() {
  return orpc.home.get.queryKey();
}

/**
 * Everything the admin's home screen edits and previews (FER-020): the
 * announcement, the banners, the order of the rows, the curated articles,
 * and the store's categories and articles to pick from.
 */
export function useHomeCuration() {
  return useQuery(orpc.home.get.queryOptions());
}

/** What `home.get` answers: the home screen's data. */
export type HomeCurationData = NonNullable<
  ReturnType<typeof useHomeCuration>["data"]
>;
