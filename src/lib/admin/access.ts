import "server-only";
import { ORPCError } from "@orpc/client";
import { notFound, redirect } from "next/navigation";

import { signInPath } from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { caller } from "@/lib/orpc/server";
import { storeSlugSchema } from "@/lib/schemas/store";

/**
 * The signed-in login as the admin's pages see it (`admin.me`: the role from
 * the database, the stores it may open). A visitor without a session goes to
 * the sign-in page, which brings them back to `returnTo` afterwards (FER-013).
 * Called by each page inside its boundary: layouts decide nothing.
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

/** The admin profile `requireAdmin` answers. */
export type AdminProfile = Awaited<ReturnType<typeof requireAdmin>>;

/**
 * The store at `slug` among the ones the login may work on (`admin.me`
 * already lists them under the same rule as `storeProcedure`), else a 404:
 * another store's admin is as absent as a store that does not exist.
 */
export function requireAdminStore(me: AdminProfile, slug: string) {
  const store = me.stores.find((candidate) => candidate.slug === slug);

  if (!store) {
    notFound();
  }

  return store;
}

/**
 * The URL's store segment as a slug, or a 404 before anything else reads it:
 * it goes into redirects and return paths.
 */
export function requireStoreSegment(segment: string): string {
  const slug = storeSlugSchema.safeParse(segment);

  if (!slug.success) {
    notFound();
  }

  return slug.data;
}
