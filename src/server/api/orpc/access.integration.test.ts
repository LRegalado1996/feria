import { randomUUID } from "node:crypto";

import { call } from "@orpc/server";
import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { storeScopeSchema } from "@/lib/schemas/access";
import { createStoreSchema } from "@/lib/schemas/store";
import { createAccount } from "@/server/better-auth/accounts";
import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { store, storeMember, user } from "@/server/db/schema";
import { addStoreMember } from "@/server/services/access";
import { createStore } from "@/server/services/store";

import { storeProcedure, superadminProcedure } from ".";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// What this file created, by id, deleted after each test. Deleting a store
// or a user cascades to its memberships.
const created = { storeIds: [] as number[], userIds: [] as string[] };

afterEach(async () => {
  await db.delete(store).where(inArray(store.id, created.storeIds.splice(0)));
  await db.delete(user).where(inArray(user.id, created.userIds.splice(0)));
});

async function makeStore() {
  const row = await createStore(
    db,
    createStoreSchema.parse({
      colorAccent: "#c8f31d",
      colorBackground: "#f2f3f0",
      colorContrast: "#111312",
      colorForeground: "#111312",
      colorSurface: "#ffffff",
      currencyCode: "UYU",
      instagramUrl: null,
      isActive: true,
      isDefault: false,
      logoUrl: null,
      name: "Access Test",
      slug: `access-${randomUUID().slice(0, 8)}`,
      tiktokUrl: null,
      translations: [],
      whatsappNumber: null,
    })
  );
  created.storeIds.push(row.id);

  return row;
}

async function makeUser(role: "member" | "superadmin") {
  const account = await createAccount(auth, {
    email: `access-${randomUUID()}@example.test`,
    name: "Access Test",
    password: "synthetic-pass-123",
    role,
  });
  created.userIds.push(account.id);

  return account;
}

/** Two stores, a member of the first only, a superadmin and an outsider. */
async function setup() {
  const [storeA, storeB] = [await makeStore(), await makeStore()];
  const member = await makeUser("member");
  const outsider = await makeUser("member");
  const superadmin = await makeUser("superadmin");
  await addStoreMember(db, { storeId: storeA.id, userId: member.id });

  const scoped = storeProcedure(storeScopeSchema).handler(({ context }) => ({
    id: context.store.id,
    slug: context.store.slug,
  }));
  const platform = superadminProcedure.handler(() => "platform");
  const as = (userId: string) => ({
    context: { db, headers: new Headers(), session: { user: { id: userId } } },
  });

  return {
    member,
    outsider,
    storeA,
    storeB,
    superadmin,
    onStore: async (userId: string, storeSlug: string) =>
      await call(scoped, { storeSlug }, as(userId) as never),
    onPlatform: async (userId: string) =>
      await call(platform, undefined, as(userId) as never),
  };
}

const STORE_NOT_FOUND = { code: "NOT_FOUND", message: "Store not found" };

describe("storeProcedure against the database", () => {
  test("a member reaches their own store", async () => {
    const { member, onStore, storeA } = await setup();

    await expect(onStore(member.id, storeA.slug)).resolves.toEqual({
      id: storeA.id,
      slug: storeA.slug,
    });
  });

  test("a member of store A gets NOT_FOUND for store B, the same answer as for no store", async () => {
    const { member, onStore, storeB } = await setup();

    await expect(onStore(member.id, storeB.slug)).rejects.toMatchObject(
      STORE_NOT_FOUND
    );
    await expect(onStore(member.id, "no-such-store")).rejects.toMatchObject(
      STORE_NOT_FOUND
    );
  });

  test("a login with no membership reaches no store", async () => {
    const { onStore, outsider, storeA } = await setup();

    await expect(onStore(outsider.id, storeA.slug)).rejects.toMatchObject(
      STORE_NOT_FOUND
    );
  });

  test("a superadmin reaches every store without a membership", async () => {
    const { onStore, storeA, storeB, superadmin } = await setup();

    await expect(onStore(superadmin.id, storeA.slug)).resolves.toMatchObject({
      id: storeA.id,
    });
    await expect(onStore(superadmin.id, storeB.slug)).resolves.toMatchObject({
      id: storeB.id,
    });
  });

  test("a membership removed takes the store away on the next call", async () => {
    const { member, onStore, storeA } = await setup();
    await db
      .delete(storeMember)
      .where(inArray(storeMember.userId, [member.id]));

    await expect(onStore(member.id, storeA.slug)).rejects.toMatchObject(
      STORE_NOT_FOUND
    );
  });
});

describe("superadminProcedure against the database", () => {
  test("lets a superadmin through and refuses a member", async () => {
    const { member, onPlatform, superadmin } = await setup();

    await expect(onPlatform(superadmin.id)).resolves.toBe("platform");
    await expect(onPlatform(member.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("a superadmin demoted in the database is refused at once, whatever the session says", async () => {
    const { onPlatform, superadmin } = await setup();
    await db
      .update(user)
      .set({ role: "member" })
      .where(inArray(user.id, [superadmin.id]));

    await expect(onPlatform(superadmin.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
