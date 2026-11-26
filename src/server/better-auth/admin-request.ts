import { getSessionCookie } from "better-auth/cookies";

import { db } from "@/server/db";
import { findLogin } from "@/server/services/access";

import { auth } from ".";

/**
 * Whether a request comes from a signed-in admin, decided on the server
 * (FER-034: an admin sees the store while it is closed to the public). The
 * session's token is looked up in the database, bypassing the cookie cache
 * (a revoked session never passes), and its login is re-read like
 * `adminProcedure` does (enabled, on a password of its own, FER-015): a
 * cookie alone, forged or stale, proves nothing.
 *
 * A request without a session cookie answers `false` without a query, so the
 * public, who never sign in, costs the database nothing here.
 */
export async function isAdminRequest(headers: Headers): Promise<boolean> {
  if (getSessionCookie(headers) === null) {
    return false;
  }

  const session = await auth.api.getSession({
    headers,
    query: { disableCookieCache: true },
  });

  if (!session) {
    return false;
  }

  // A login still on a temporary password (FER-015) is no admin yet.
  const login = await findLogin(db, session.user.id);

  return login !== null && !login.mustChangePassword;
}
