import { randomUUID } from "node:crypto";

import { call } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createAccount } from "@/server/better-auth/accounts";
import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { withAdmin } from "@/server/services/access";
import { theStoreId } from "@/server/test/one-store";
import {
  backendPid,
  deferred,
  readyOrFailed,
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilBlockedBy,
} from "@/server/test/two-writers";

import { adminProcedure } from ".";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The logins this file created, by id, deleted after each test (a test may
// have deleted one already). Deleting a user cascades to its sessions.
const createdUserIds: string[] = [];

afterEach(async () => {
  // A held writer still holds its lock on a login: let it finish first.
  await releaseHeldWriters();
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

async function makeLogin() {
  const account = await createAccount(auth, db, {
    email: `access-${randomUUID()}@example.test`,
    name: "Access Test",
    password: "synthetic-pass-123",
  });
  createdUserIds.push(account.id);

  return account;
}

async function removeLogin(userId: string) {
  await db.delete(user).where(eq(user.id, userId));
}

/**
 * A procedure built on `adminProcedure`, called as `userId`. The session
 * claims a superadmin: the builder must read the database, never this.
 */
async function callAs(userId: string) {
  const procedure = adminProcedure.handler(({ context }) => ({
    storeId: context.store.id,
    userId: context.session.user.id,
  }));

  return await call(procedure, undefined, {
    context: {
      db,
      headers: new Headers(),
      session: { user: { id: userId, role: "superadmin" } },
    } as never,
  });
}

describe("adminProcedure against the database", () => {
  test("any login reaches the store, whatever role the database holds for it", async () => {
    const storeId = await theStoreId(db);
    const [plain, promoted] = [await makeLogin(), await makeLogin()];
    await db
      .update(user)
      .set({ role: "superadmin" })
      .where(eq(user.id, promoted.id));

    await expect(callAs(plain.id)).resolves.toEqual({
      storeId,
      userId: plain.id,
    });
    await expect(callAs(promoted.id)).resolves.toEqual({
      storeId,
      userId: promoted.id,
    });
  });

  test("a login removed from the database is refused at once, whatever the session says", async () => {
    const login = await makeLogin();
    await removeLogin(login.id);

    await expect(callAs(login.id)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  });
});

describe("withAdmin under two writers", () => {
  test("a login's removal waits for its write that already holds the lock", async () => {
    const login = await makeLogin();
    const order: string[] = [];
    const held = deferred();
    const writerPid = deferred<number>();
    const removerPid = deferred<number>();

    const write = withAdmin(db, login.id, async (tx) => {
      writerPid.resolve(await backendPid(tx));
      await held.promise;
      order.push("write");
    });
    const writer = await readyOrFailed(writerPid.promise, write);
    const removal = db.transaction(async (tx) => {
      removerPid.resolve(await backendPid(tx));
      await tx.delete(user).where(eq(user.id, login.id));
      order.push("removal");
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled([write, removal])
    );
    const remover = await readyOrFailed(removerPid.promise, removal);

    // The removal waits on the write's share lock on the login's row.
    await waitUntilBlockedBy(db, remover, writer);
    held.resolve(undefined);
    await Promise.all([write, removal]);

    expect(order).toEqual(["write", "removal"]);
    expect(
      await db.query.user.findFirst({ where: eq(user.id, login.id) })
    ).toBeUndefined();
  });

  test("control: a removal that commits first refuses the write, which runs nothing", async () => {
    const login = await makeLogin();
    await removeLogin(login.id);
    const write = vi.fn(async () => await Promise.resolve("written"));

    await expect(withAdmin(db, login.id, write)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(write).not.toHaveBeenCalled();
  });
});
