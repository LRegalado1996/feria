import { ORPCError } from "@orpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { LOGIN_REFUSALS } from "@/lib/schemas/access";
import type { DatabaseClient } from "@/server/db";
import { store, user } from "@/server/db/schema";

/** A login that may sign in, as the admin's checks read it. */
export interface ActiveLogin {
  id: string;
  /** Its password is a temporary one an admin typed (FER-015). */
  mustChangePassword: boolean;
}

/** The caller as the session names it: its login and the session itself. */
export interface SessionRef {
  sessionId: string;
  userId: string;
}

/**
 * `userId` if it is still a login, an enabled one (FER-015), and `sessionId`
 * is still one of its sessions, else `null`. Its expiry is Better Auth's to
 * check, on its own clock. Better Auth caches a
 * session in a cookie for minutes, so the cached copy can outlive its user,
 * the user's disabling, or the session itself (ended by a password change
 * or a reset): access is re-read from the database, never trusted from the
 * cookie. One query: the session is checked inside the user's read.
 */
export async function findLogin(
  db: DatabaseClient,
  { sessionId, userId }: SessionRef
): Promise<ActiveLogin | null> {
  const found = await db.query.user.findFirst({
    columns: { id: true, mustChangePassword: true },
    where: and(
      eq(user.id, userId),
      isNull(user.disabledAt),
      // The session's columns are spelled out: a relational query qualifies
      // every column it interpolates with its own table's alias, so
      // `${session.userId}` would read `"user"."userId"`.
      sql`exists (select 1 from "session" where "session"."id" = ${sessionId} and "session"."userId" = ${user.id})`
    ),
  });

  return found ?? null;
}

/**
 * The store, the table's one row: its id is the scope of every query the
 * admin's procedures make. No row is NOT_FOUND, a database whose migrations
 * have not run.
 */
async function findStore(db: DatabaseClient) {
  const [found] = await db.select({ id: store.id }).from(store).limit(1);

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Store not found" });
  }

  return found;
}

/**
 * The store an admin works on, if the caller is still an enabled login on a
 * live session (`findLogin`), else `null`. Every login is an admin and reaches the whole admin (FER-038),
 * once it has chosen its own password: one still on the temporary password
 * an admin gave it (FER-015) is FORBIDDEN, and reaches only the page that
 * changes it.
 */
export async function findAdminStore(db: DatabaseClient, caller: SessionRef) {
  const login = await findLogin(db, caller);

  if (!login) {
    return null;
  }

  if (login.mustChangePassword) {
    throw new ORPCError("FORBIDDEN", {
      message: LOGIN_REFUSALS.passwordChangeRequired,
    });
  }

  return await findStore(db);
}

/**
 * Whether `userId` was disabled by an admin (FER-015): Better Auth asks
 * before it opens a session, so a disabled login cannot sign in. A login the
 * database no longer has is not "disabled": its sign-in has nothing to open
 * a session for.
 */
export async function isLoginDisabled(
  db: DatabaseClient,
  userId: string
): Promise<boolean> {
  const found = await db.query.user.findFirst({
    columns: { disabledAt: true },
    where: eq(user.id, userId),
  });

  return found !== undefined && found.disabledAt !== null;
}

/** Whether any login exists: the first-run script runs only once. */
export async function hasLogin(db: DatabaseClient): Promise<boolean> {
  const found = await db.query.user.findFirst({ columns: { id: true } });

  return found !== undefined;
}

/**
 * Runs `write` in a transaction that first re-reads the caller's login under
 * a row lock (resolve, lock, commit in `docs/agents/database.md`): `FOR
 * SHARE` on its user row, so a login removed or disabled before the write
 * refuses it, and one removed or disabled later waits for it to commit. A
 * login still on a temporary password (FER-015) is refused too. The
 * procedure's own check is a snapshot taken before the transaction; this is
 * the one that holds while the row is written.
 */
export async function withAdmin<T>(
  db: DatabaseClient,
  userId: string,
  write: (tx: DatabaseClient) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    const [login] = await tx
      .select({ id: user.id })
      .from(user)
      .where(
        and(
          eq(user.id, userId),
          isNull(user.disabledAt),
          eq(user.mustChangePassword, false)
        )
      )
      .for("share");

    if (!login) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return await write(tx);
  });
}
