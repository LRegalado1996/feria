import { ORPCError } from "@orpc/server";
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import { LOGIN_REFUSALS } from "@/lib/schemas/access";
import type { AccountAuth } from "@/server/better-auth/accounts";
import type { DatabaseClient } from "@/server/db";
import { account, session, user } from "@/server/db/schema";

// Better Auth's provider id for an email and password.
const CREDENTIAL_PROVIDER = "credential";

function loginNotFound() {
  return new ORPCError("NOT_FOUND", { message: "Login not found" });
}

/**
 * The store's logins for the admin's list (FER-015), the oldest first: a
 * store has a handful, so the list is whole. Nothing secret leaves here.
 */
export async function listLogins(db: DatabaseClient) {
  return await db
    .select({
      createdAt: user.createdAt,
      disabledAt: user.disabledAt,
      email: user.email,
      id: user.id,
      mustChangePassword: user.mustChangePassword,
      name: user.name,
      role: user.role,
    })
    .from(user)
    .orderBy(asc(user.createdAt), asc(user.id));
}

/**
 * Locks, `FOR UPDATE`, the user rows `where` matches, in the order of their
 * ids. Every write to the logins takes its rows through here in one
 * statement, so two of them always lock in the same order and never wait on
 * each other in a circle (`docs/agents/database.md` § Multi-step writes).
 */
async function lockLogins(tx: DatabaseClient, where: SQL | undefined) {
  return await tx
    .select({
      disabledAt: user.disabledAt,
      id: user.id,
      mustChangePassword: user.mustChangePassword,
      role: user.role,
    })
    .from(user)
    .where(where)
    .orderBy(asc(user.id))
    .for("update");
}

type LockedLogin = Awaited<ReturnType<typeof lockLogins>>[number];

/**
 * The caller among the rows just locked, refused unless it is an enabled
 * login that has chosen its own password: the procedure's check was a
 * snapshot, this one holds until the write commits.
 */
function assertActor(rows: readonly LockedLogin[], actorId: string) {
  const actor = rows.find((row) => row.id === actorId);

  if (!actor || actor.disabledAt !== null || actor.mustChangePassword) {
    throw new ORPCError("UNAUTHORIZED");
  }
}

/**
 * The login acted on among the rows just locked. The superadmin is
 * protected (Lucas, 2026-11-25): no other login disables, enables or resets
 * it; it changes its own password, knowing the current one.
 */
function findTarget(rows: readonly LockedLogin[], targetId: string) {
  const target = rows.find((row) => row.id === targetId);

  if (!target) {
    throw loginNotFound();
  }

  if (target.role === "superadmin") {
    throw new ORPCError("FORBIDDEN", {
      message: LOGIN_REFUSALS.protectedLogin,
    });
  }

  return target;
}

/**
 * Disables `targetId` (FER-015) and ends every session it has: it cannot
 * sign in again until an admin enables it. Three safeguards: nobody disables
 * their own login, nobody disables the superadmin, and the last enabled
 * login is never disabled, so the store always keeps one that can sign in.
 *
 * Every enabled login is locked with the target before anything is decided:
 * two admins disabling each other at once are serialized, and the second
 * finds itself the last one left. Disabling a login already disabled keeps
 * the date it was disabled on.
 */
export async function disableLogin(
  db: DatabaseClient,
  { actorId, targetId }: { actorId: string; targetId: string }
) {
  if (actorId === targetId) {
    throw new ORPCError("FORBIDDEN", {
      message: LOGIN_REFUSALS.ownLoginDisabled,
    });
  }

  return await db.transaction(async (tx) => {
    const rows = await lockLogins(
      tx,
      or(isNull(user.disabledAt), eq(user.id, targetId))
    );
    const target = findTarget(rows, targetId);

    if (target.disabledAt !== null) {
      assertActor(rows, actorId);
      return { disabledAt: target.disabledAt, id: target.id };
    }

    const othersEnabled = rows.filter(
      (row) => row.disabledAt === null && row.id !== targetId
    );

    if (othersEnabled.length === 0) {
      throw new ORPCError("CONFLICT", {
        message: LOGIN_REFUSALS.lastEnabledLogin,
      });
    }

    assertActor(rows, actorId);

    // The database's clock, read after the locks are held.
    const [disabled] = await tx
      .update(user)
      .set({ disabledAt: sql`clock_timestamp()` })
      .where(eq(user.id, targetId))
      .returning({ disabledAt: user.disabledAt, id: user.id });

    // The row was locked above, so the update found it.
    if (!disabled) {
      throw loginNotFound();
    }

    await tx.delete(session).where(eq(session.userId, targetId));

    return disabled;
  });
}

/** Enables a disabled login again (FER-015); an enabled one stays as it is. */
export async function enableLogin(
  db: DatabaseClient,
  { actorId, targetId }: { actorId: string; targetId: string }
) {
  return await db.transaction(async (tx) => {
    const rows = await lockLogins(tx, inArray(user.id, [actorId, targetId]));
    assertActor(rows, actorId);
    const target = findTarget(rows, targetId);

    if (target.disabledAt !== null) {
      await tx
        .update(user)
        .set({ disabledAt: null })
        .where(eq(user.id, targetId));
    }

    return { disabledAt: null, id: targetId };
  });
}

/**
 * Gives `targetId` a new temporary password an admin typed (FER-015): its
 * sessions end, and once it signs in with it, it must choose its own before
 * it reaches the admin. Nobody resets their own password: they change it,
 * which asks for the current one.
 */
export async function resetLoginPassword(
  auth: AccountAuth,
  db: DatabaseClient,
  {
    actorId,
    password,
    targetId,
  }: { actorId: string; password: string; targetId: string }
) {
  if (actorId === targetId) {
    throw new ORPCError("FORBIDDEN", {
      message: LOGIN_REFUSALS.ownPasswordReset,
    });
  }

  const context = await auth.$context;
  // Hashed before the locks: it is the slow part, and needs none.
  const hash = await context.password.hash(password);

  return await db.transaction(async (tx) => {
    const rows = await lockLogins(tx, inArray(user.id, [actorId, targetId]));
    assertActor(rows, actorId);
    findTarget(rows, targetId);

    const updated = await tx
      .update(account)
      .set({ password: hash })
      .where(
        and(
          eq(account.userId, targetId),
          eq(account.providerId, CREDENTIAL_PROVIDER)
        )
      )
      .returning({ id: account.id });

    // Every login here is created with a password (`createAccount`).
    if (updated.length === 0) {
      throw loginNotFound();
    }

    await tx
      .update(user)
      .set({ mustChangePassword: true })
      .where(eq(user.id, targetId));
    await tx.delete(session).where(eq(session.userId, targetId));

    return { id: targetId, mustChangePassword: true };
  });
}

/**
 * The signed-in login choosing its own password (FER-015): after a
 * temporary one, or whenever it wants. It must know the current one. Its
 * other sessions end, the one it is using stays, and it is no longer sent
 * to change it.
 *
 * The user row and its password are locked before the current password is
 * checked, so a reset by an admin meanwhile is either seen here or waits.
 */
export async function changeOwnPassword(
  auth: AccountAuth,
  db: DatabaseClient,
  {
    currentPassword,
    newPassword,
    sessionId,
    userId,
  }: {
    currentPassword: string;
    newPassword: string;
    /** The session making the change, the one that stays open. */
    sessionId: string;
    userId: string;
  }
) {
  const context = await auth.$context;

  return await db.transaction(async (tx) => {
    const [login] = await lockLogins(
      tx,
      and(eq(user.id, userId), isNull(user.disabledAt))
    );

    if (!login) {
      throw new ORPCError("UNAUTHORIZED");
    }

    const [credential] = await tx
      .select({ id: account.id, password: account.password })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, CREDENTIAL_PROVIDER)
        )
      )
      .for("update");

    const matches =
      credential?.password != null &&
      (await context.password.verify({
        hash: credential.password,
        password: currentPassword,
      }));

    if (!(credential && matches)) {
      throw new ORPCError("BAD_REQUEST", {
        message: LOGIN_REFUSALS.wrongCurrentPassword,
      });
    }

    await tx
      .update(account)
      .set({ password: await context.password.hash(newPassword) })
      .where(eq(account.id, credential.id));
    await tx
      .update(user)
      .set({ mustChangePassword: false })
      .where(eq(user.id, userId));
    await tx
      .delete(session)
      .where(and(eq(session.userId, userId), ne(session.id, sessionId)));

    return { id: userId, mustChangePassword: false };
  });
}
