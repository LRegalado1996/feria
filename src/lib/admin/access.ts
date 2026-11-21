import "server-only";
import { ORPCError } from "@orpc/client";
import { redirect } from "next/navigation";

import { signInPath } from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { caller } from "@/lib/orpc/server";

/**
 * The signed-in login as the admin's pages see it (`admin.me`, re-read from
 * the database). Every login is an admin and reaches every section
 * (FER-038), so being signed in is the whole check. A visitor without a
 * session goes to the sign-in page, which brings them back to `returnTo`
 * afterwards (FER-013). Called by each page inside its boundary: layouts
 * decide nothing.
 */
export async function requireAdmin(returnTo: string, locale: Locale) {
  try {
    return await caller.admin.me();
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
      redirect(signInPath(returnTo, locale));
    }

    throw error;
  }
}
