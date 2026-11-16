import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";

import type { DatabaseClient } from "@/server/db";
import { store, user } from "@/server/db/schema";

/**
 * Whether `userId` is still a login. The session can outlive its user for a
 * few minutes (Better Auth caches it in a cookie), so access is re-read from
 * the database, never trusted from the session.
 */
async function isLogin(db: DatabaseClient, userId: string): Promise<boolean> {
  const found = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.id, userId),
  });

  return found !== undefined;
}

/**
 * The store an admin works on, if `userId` is still a login, else `null`.
 * Every login is an admin and reaches the whole admin (FER-038), and the
 * store is the table's one row: its id is the scope of every query the
 * admin's procedures make. No row is NOT_FOUND, a database whose migrations
 * have not run.
 */
export async function findAdminStore(db: DatabaseClient, userId: string) {
  if (!(await isLogin(db, userId))) {
    return null;
  }

  const [found] = await db.select({ id: store.id }).from(store).limit(1);

  if (!found) {
    throw new ORPCError("NOT_FOUND", { message: "Store not found" });
  }

  return found;
}

/** Whether any login exists: the first-run script runs only once. */
export async function hasLogin(db: DatabaseClient): Promise<boolean> {
  const found = await db.query.user.findFirst({ columns: { id: true } });

  return found !== undefined;
}

/**
 * Runs `write` in a transaction that first re-reads the caller's login under
 * a row lock (resolve, lock, commit in `docs/agents/database.md`): `FOR
 * SHARE` on its user row, so a login removed before the write refuses it
 * and one removed later waits for it to commit. The procedure's own check
 * is a snapshot taken before the transaction; this is the one that holds
 * while the row is written.
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
      .where(eq(user.id, userId))
      .for("share");

    if (!login) {
      throw new ORPCError("UNAUTHORIZED");
    }

    return await write(tx);
  });
}
