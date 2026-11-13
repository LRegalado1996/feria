import { headers } from "next/headers";
import { cache } from "react";

import { auth } from ".";

/**
 * The page-side session read. It bypasses the cookie cache: pages run far less
 * often than procedures and decide what a user may see, so a revoked session
 * must not pass here for the cache's lifetime. `cache()` keeps it to one
 * lookup per render.
 */
export const getSession = cache(
  async () =>
    await auth.api.getSession({
      headers: await headers(),
      query: { disableCookieCache: true },
    })
);
