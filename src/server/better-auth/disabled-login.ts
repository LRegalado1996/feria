import { APIError } from "better-auth/api";

import { LOGIN_DISABLED_CODE } from "@/lib/schemas/access";
import type { DatabaseClient } from "@/server/db";
import { isLoginDisabled } from "@/server/services/access";

/**
 * Better Auth's `databaseHooks.session.create.before`: no session opens for
 * a login an admin disabled, so it cannot sign in. Its sessions were ended
 * when it was disabled, and every procedure and page re-reads the login too,
 * so this is the door, not the only lock.
 */
export function refuseDisabledLogin(db: DatabaseClient) {
  return async (session: { userId: string }): Promise<void> => {
    if (await isLoginDisabled(db, session.userId)) {
      throw APIError.from("FORBIDDEN", {
        code: LOGIN_DISABLED_CODE,
        message: "This login is disabled",
      });
    }
  };
}
