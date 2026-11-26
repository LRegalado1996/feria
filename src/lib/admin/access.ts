import "server-only";
import { ORPCError } from "@orpc/client";
import { redirect } from "next/navigation";

import { changePasswordPath, signInPath } from "@/lib/admin/paths";
import type { Locale } from "@/lib/i18n/config";
import { caller } from "@/lib/orpc/server";

/**
 * The signed-in login as the change-password page sees it (`admin.me`,
 * re-read from the database): any enabled login, even one still on a
 * temporary password (FER-015). A visitor without a session, or whose login
 * was removed or disabled, goes to the sign-in page, which brings them back
 * to `returnTo` afterwards (FER-013). Called by the page inside its
 * boundary: layouts decide nothing.
 */
export async function requireLogin(returnTo: string, locale: Locale) {
  try {
    return await caller.admin.me();
  } catch (error) {
    if (error instanceof ORPCError && error.code === "UNAUTHORIZED") {
      redirect(signInPath(returnTo, locale));
    }

    throw error;
  }
}

/**
 * The signed-in login as every other admin page sees it. Every login is an
 * admin and reaches every section (FER-038), so being signed in is the whole
 * check, once the login has chosen its own password: one still on the
 * temporary password an admin gave it goes to change it first, and comes
 * back to `returnTo` afterwards (FER-015).
 */
export async function requireAdmin(
  returnTo: string,
  locale: Locale
): Promise<{ email: string; name: string }> {
  const { email, mustChangePassword, name } = await requireLogin(
    returnTo,
    locale
  );

  if (mustChangePassword) {
    redirect(changePasswordPath(returnTo, locale));
  }

  return { email, name };
}
