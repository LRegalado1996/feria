import { ORPCError } from "@orpc/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";

import type { UserRole } from "@/lib/schemas/access";
import type { DatabaseClient } from "@/server/db";
import { store, storeMember, user } from "@/server/db/schema";

/**
 * The role a user holds now, read from the database rather than the session:
 * the session's copy is cached in a cookie for minutes, so a demoted
 * superadmin would keep their access until it expires. `null` when the user
 * no longer exists.
 */
export async function getUserRole(
  db: DatabaseClient,
  userId: string
): Promise<UserRole | null> {
  const found = await db.query.user.findFirst({
    columns: { role: true },
    where: eq(user.id, userId),
  });

  return found?.role ?? null;
}

/**
 * Whether `userId` is a superadmin, or a member of the store the outer query
 * is on: conditions of that one query, not reads of their own.
 */
function mayWorkOnStore(userId: string) {
  return or(
    sql`exists (select 1 from ${user} where ${and(eq(user.id, userId), eq(user.role, "superadmin"))})`,
    sql`exists (select 1 from ${storeMember} where ${and(eq(storeMember.storeId, store.id), eq(storeMember.userId, userId))})`
  );
}

/**
 * The store at `slug`, if `userId` may work on it: a superadmin may work on
 * every store, a member on the stores they belong to, inactive ones included
 * (the admin is where a store is reactivated). A store that does not exist
 * and one the user may not see are the same `null`, so the answer never
 * confirms that another store exists.
 */
export async function findAccessibleStore(
  db: DatabaseClient,
  { slug, userId }: { slug: string; userId: string }
) {
  // The query builder, not `db.query`: a relational read renames every
  // column in its `where` to the root table's alias, subqueries' included.
  const [found] = await db
    .select()
    .from(store)
    .where(and(eq(store.slug, slug), mayWorkOnStore(userId)))
    .limit(1);

  return found ?? null;
}

/** Whether any superadmin exists: the first-run script runs only once. */
export async function hasSuperadmin(db: DatabaseClient): Promise<boolean> {
  const found = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.role, "superadmin"),
  });

  return found !== undefined;
}

/**
 * Makes `userId` a member of `storeId`. Adding a member twice is a no-op, so a
 * seed or a retried request converges.
 */
export async function addStoreMember(
  db: DatabaseClient,
  { storeId, userId }: { storeId: number; userId: string }
) {
  await db
    .insert(storeMember)
    .values({ storeId, userId })
    .onConflictDoNothing({
      target: [storeMember.storeId, storeMember.userId],
    });
}

/** Gives `userId` a role. A user that does not exist is NOT_FOUND. */
export async function setUserRole(
  db: DatabaseClient,
  { role, userId }: { role: UserRole; userId: string }
) {
  const [updated] = await db
    .update(user)
    .set({ role })
    .where(eq(user.id, userId))
    .returning({ id: user.id });

  if (!updated) {
    throw new ORPCError("NOT_FOUND", { message: "User not found" });
  }
}

/** The ids of the stores at these slugs, by slug; missing ones are absent. */
export async function listStoreIdsBySlug(
  db: DatabaseClient,
  slugs: string[]
): Promise<Map<string, number>> {
  if (slugs.length === 0) {
    return new Map();
  }

  const rows = await db.query.store.findMany({
    columns: { id: true, slug: true },
    where: inArray(store.slug, slugs),
  });

  return new Map(rows.map((row) => [row.slug, row.id]));
}
