import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PASSWORD_ATTEMPTS } from "@/lib/schemas/access";
import { createAccount } from "@/server/better-auth/accounts";
import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { rateLimit, session, user } from "@/server/db/schema";
import { findLogin } from "@/server/services/access";
import {
  backendPid,
  deferred,
  readyOrFailed,
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilBlockedBy,
} from "@/server/test/two-writers";

import {
  changeOwnPassword,
  disableLogin,
  enableLogin,
  resetLoginPassword,
} from "./user";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const PASSWORD = "synthetic-pass-123";

// The logins this file created, by id. Deleting a user cascades to its
// sessions and accounts.
const createdUserIds: string[] = [];

afterEach(async () => {
  // A held writer still holds its locks on the logins: let it finish first.
  await releaseHeldWriters();
  const ids = createdUserIds.splice(0);
  // A login's count of wrong tries is keyed by its id, not tied to its row.
  await db.delete(rateLimit).where(
    inArray(
      rateLimit.key,
      ids.map((id) => `change-password:${id}`)
    )
  );
  await db.delete(user).where(inArray(user.id, ids));
});

async function makeLogin({
  mustChangePassword = false,
  role = "member",
}: { mustChangePassword?: boolean; role?: "member" | "superadmin" } = {}) {
  const created = await createAccount(
    auth,
    db,
    {
      email: `users-${randomUUID()}@example.test`,
      name: "Users Test",
      password: PASSWORD,
    },
    { mustChangePassword, role }
  );
  createdUserIds.push(created.id);

  return created;
}

async function signIn(email: string, password = PASSWORD) {
  return await auth.api.signInEmail({ body: { email, password } });
}

async function rowOf(userId: string) {
  return await db.query.user.findFirst({
    columns: { disabledAt: true, mustChangePassword: true },
    where: eq(user.id, userId),
  });
}

async function sessionCountOf(userId: string) {
  const rows = await db.query.session.findMany({
    columns: { id: true },
    where: eq(session.userId, userId),
  });

  return rows.length;
}

describe("disableLogin under two writers", () => {
  test("two admins disabling each other at once: the second waits, then finds itself disabled", async () => {
    // Cris stays enabled whatever else this database holds, so Bea's request
    // always meets the check of its own caller, never the last-login one.
    const [ana, bea] = [await makeLogin(), await makeLogin()];
    await makeLogin();
    const held = deferred();
    const firstLocked = deferred<number>();
    const secondPid = deferred<number>();

    // Ana disables Bea and holds her transaction open, its locks held; the
    // signal goes once they are.
    const first = db.transaction(async (tx) => {
      const pid = await backendPid(tx);
      await disableLogin(tx, { actorId: ana.id, targetId: bea.id });
      firstLocked.resolve(pid);
      await held.promise;
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await first.catch(() => undefined)
    );
    const firstWriter = await readyOrFailed(firstLocked.promise, first);
    // Bea, still signed in, disables Ana meanwhile.
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));
      return await disableLogin(tx, { actorId: bea.id, targetId: ana.id });
    });
    const outcome = second.then(
      () => "disabled",
      (error: unknown) => error
    );
    const secondWriter = await readyOrFailed(secondPid.promise, second);

    // Bea's request waits on Ana's locks instead of reading around them.
    await waitUntilBlockedBy(db, secondWriter, firstWriter);
    held.resolve(undefined);
    await first;

    await expect(outcome).resolves.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    await expect(rowOf(ana.id)).resolves.toEqual({
      disabledAt: null,
      mustChangePassword: false,
    });
    expect((await rowOf(bea.id))?.disabledAt).toBeInstanceOf(Date);
  });
});

describe("a reset and a password change under two writers", () => {
  test("a change started while a reset holds the login waits for it, then refuses the superseded password", async () => {
    const [ana, bea] = [await makeLogin(), await makeLogin()];
    const held = deferred();
    const firstLocked = deferred<number>();
    const secondPid = deferred<number>();

    // Ana gives Bea a new temporary password and holds the transaction open.
    const reset = db.transaction(async (tx) => {
      const pid = await backendPid(tx);
      await resetLoginPassword(auth, tx, {
        actorId: ana.id,
        password: "temporary-456",
        targetId: bea.id,
      });
      firstLocked.resolve(pid);
      await held.promise;
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await reset.catch(() => undefined)
    );
    const resetWriter = await readyOrFailed(firstLocked.promise, reset);
    // Bea, knowing only her old password, changes it meanwhile.
    const change = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));
      return await changeOwnPassword(auth, tx, {
        currentPassword: PASSWORD,
        newPassword: "bea-own-password",
        sessionId: "none",
        userId: bea.id,
      });
    });
    const outcome = change.then(
      () => "changed",
      (error: unknown) => error
    );
    const changeWriter = await readyOrFailed(secondPid.promise, change);

    // The change waits on the reset's lock instead of checking around it.
    await waitUntilBlockedBy(db, changeWriter, resetWriter);
    held.resolve(undefined);
    await reset;

    await expect(outcome).resolves.toMatchObject({
      code: "BAD_REQUEST",
      message: "The current password is not correct",
    });
    // The reset stands: the temporary password, and the mark to change it.
    await expect(rowOf(bea.id)).resolves.toEqual({
      disabledAt: null,
      mustChangePassword: true,
    });
    await expect(signIn(bea.email, "temporary-456")).resolves.toMatchObject({
      user: { id: bea.id },
    });
  });
});

describe("disabling against Better Auth", () => {
  test("ends the login's sessions and refuses its next sign-in, until it is enabled again", async () => {
    const [ana, bea] = [await makeLogin(), await makeLogin()];
    await signIn(bea.email);
    expect(await sessionCountOf(bea.id)).toBe(1);

    await disableLogin(db, { actorId: ana.id, targetId: bea.id });

    expect(await sessionCountOf(bea.id)).toBe(0);
    await expect(signIn(bea.email)).rejects.toMatchObject({
      body: { code: "LOGIN_DISABLED", message: "This login is disabled" },
      statusCode: 403,
    });
    expect(await sessionCountOf(bea.id)).toBe(0);

    await enableLogin(db, { actorId: ana.id, targetId: bea.id });

    await expect(signIn(bea.email)).resolves.toMatchObject({
      user: { id: bea.id },
    });
  });
});

describe("temporary passwords against Better Auth", () => {
  test("a reset signs the login out, lets it in with the new password only, and a change of its own clears the mark", async () => {
    const [ana, bea] = [await makeLogin(), await makeLogin()];
    await signIn(bea.email);

    await resetLoginPassword(auth, db, {
      actorId: ana.id,
      password: "temporary-456",
      targetId: bea.id,
    });

    expect(await sessionCountOf(bea.id)).toBe(0);
    await expect(rowOf(bea.id)).resolves.toEqual({
      disabledAt: null,
      mustChangePassword: true,
    });
    await expect(signIn(bea.email)).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
    // Two sessions on the temporary password: the change keeps the one
    // making it and ends the other.
    const here = await signIn(bea.email, "temporary-456");
    await signIn(bea.email, "temporary-456");
    const sessionHere = await db.query.session.findFirst({
      columns: { id: true },
      where: eq(session.token, here.token),
    });

    await changeOwnPassword(auth, db, {
      currentPassword: "temporary-456",
      newPassword: "bea-own-password",
      sessionId: sessionHere?.id ?? "",
      userId: bea.id,
    });

    await expect(rowOf(bea.id)).resolves.toEqual({
      disabledAt: null,
      mustChangePassword: false,
    });
    await expect(
      db.query.session.findMany({
        columns: { id: true },
        where: eq(session.userId, bea.id),
      })
    ).resolves.toEqual([{ id: sessionHere?.id }]);
    await expect(signIn(bea.email, "bea-own-password")).resolves.toMatchObject({
      user: { id: bea.id },
    });
    await expect(signIn(bea.email, "temporary-456")).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
  });

  test("a wrong current password changes nothing", async () => {
    const bea = await makeLogin({ mustChangePassword: true });

    await expect(
      changeOwnPassword(auth, db, {
        currentPassword: "not-the-password",
        newPassword: "bea-own-password",
        sessionId: "none",
        userId: bea.id,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The current password is not correct",
    });
    await expect(rowOf(bea.id)).resolves.toEqual({
      disabledAt: null,
      mustChangePassword: true,
    });
    await expect(signIn(bea.email)).resolves.toMatchObject({
      user: { id: bea.id },
    });
  });
});

describe("the superadmin against Better Auth", () => {
  test("no other login disables, enables or resets it: it keeps signing in with its password", async () => {
    const [ana, owner] = [
      await makeLogin(),
      await makeLogin({ role: "superadmin" }),
    ];
    await signIn(owner.email);
    const refused = {
      code: "FORBIDDEN",
      message: "The superadmin's login cannot be changed by another login",
    };

    await expect(
      disableLogin(db, { actorId: ana.id, targetId: owner.id })
    ).rejects.toMatchObject(refused);
    await expect(
      enableLogin(db, { actorId: ana.id, targetId: owner.id })
    ).rejects.toMatchObject(refused);
    await expect(
      resetLoginPassword(auth, db, {
        actorId: ana.id,
        password: "taken-over-123",
        targetId: owner.id,
      })
    ).rejects.toMatchObject(refused);

    await expect(rowOf(owner.id)).resolves.toEqual({
      disabledAt: null,
      mustChangePassword: false,
    });
    expect(await sessionCountOf(owner.id)).toBe(1);
    await expect(signIn(owner.email)).resolves.toMatchObject({
      user: { id: owner.id },
    });
    await expect(signIn(owner.email, "taken-over-123")).rejects.toMatchObject({
      body: { code: "INVALID_EMAIL_OR_PASSWORD" },
    });
  });
});

describe("sessions a password change ends", () => {
  test("are refused at once by the login check every procedure makes", async () => {
    const bea = await makeLogin();
    const here = await signIn(bea.email);
    const other = await signIn(bea.email);
    const idOf = async (token: string) =>
      (
        await db.query.session.findFirst({
          columns: { id: true },
          where: eq(session.token, token),
        })
      )?.id ?? "";
    const [hereId, otherId] = [await idOf(here.token), await idOf(other.token)];

    await changeOwnPassword(auth, db, {
      currentPassword: PASSWORD,
      newPassword: "bea-own-password",
      sessionId: hereId,
      userId: bea.id,
    });

    await expect(
      findLogin(db, { sessionId: hereId, userId: bea.id })
    ).resolves.toEqual({ id: bea.id, mustChangePassword: false });
    await expect(
      findLogin(db, { sessionId: otherId, userId: bea.id })
    ).resolves.toBeNull();
  });
});

describe("wrong current passwords against the database", () => {
  test("after the last allowed wrong try even the right password waits; a change clears the count", async () => {
    const bea = await makeLogin();
    const change = async (currentPassword: string) =>
      await changeOwnPassword(auth, db, {
        currentPassword,
        newPassword: "bea-own-password",
        sessionId: "none",
        userId: bea.id,
      });

    for (let attempt = 0; attempt < PASSWORD_ATTEMPTS.max; attempt += 1) {
      // Each wrong try commits its count before it is refused.
      await expect(change("not-the-password")).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }

    const limited: unknown = await change(PASSWORD).catch(
      (error: unknown) => error
    );
    expect(limited).toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // The whole window, less the seconds the tries above took.
    const { retryAfter } = (limited as { data: { retryAfter: number } }).data;
    expect(retryAfter).toBeLessThanOrEqual(PASSWORD_ATTEMPTS.windowMs / 1000);
    expect(retryAfter).toBeGreaterThan(PASSWORD_ATTEMPTS.windowMs / 1000 - 60);
    await expect(signIn(bea.email)).resolves.toMatchObject({
      user: { id: bea.id },
    });

    // A whole window later the right password goes through and clears it.
    await db
      .update(rateLimit)
      .set({ lastRequest: Date.now() - PASSWORD_ATTEMPTS.windowMs })
      .where(eq(rateLimit.key, `change-password:${bea.id}`));
    await expect(change(PASSWORD)).resolves.toEqual({
      id: bea.id,
      mustChangePassword: false,
    });
    await expect(
      db.query.rateLimit.findFirst({
        where: eq(rateLimit.key, `change-password:${bea.id}`),
      })
    ).resolves.toBeUndefined();
  });
});
