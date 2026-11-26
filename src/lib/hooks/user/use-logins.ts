import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc/client";

/** The query key of the store's logins, for the mutations below. */
export function loginsKey() {
  return orpc.user.list.queryKey();
}

/** The store's logins, the oldest first (FER-015). */
export function useLogins() {
  return useQuery(orpc.user.list.queryOptions());
}

/** One login as the list reads it. */
export type LoginRow = NonNullable<
  ReturnType<typeof useLogins>["data"]
>[number];
