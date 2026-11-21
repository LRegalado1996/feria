import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of the coming-soon page, for the writes below. */
export function comingSoonKey() {
  return orpc.comingSoon.get.queryKey();
}

/**
 * The coming-soon page as the admin manages it (FER-034): its switch, the
 * day it counts to and its texts, as `comingSoon.get` reads them.
 */
export function useComingSoon() {
  return useQuery(orpc.comingSoon.get.queryOptions());
}
