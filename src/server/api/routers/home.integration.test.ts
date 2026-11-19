import { randomUUID } from "node:crypto";

import { call } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createORPCContext } from "@/server/api/orpc";
import { createAccount } from "@/server/better-auth/accounts";
import { auth } from "@/server/better-auth/config";
import { db } from "@/server/db";
import { announcement, user } from "@/server/db/schema";
import { theStoreId } from "@/server/test/one-store";

import { homeRouter } from "./home";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Next's cache only exists inside a Next render: a write's invalidation is
// a spy here.
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

// The logins this file created; deleting one deletes its sessions.
const createdUserIds: string[] = [];

afterEach(async () => {
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));
});

/** An announcement a refused write would have saved. */
function makeAnnouncement() {
  return {
    endsOn: null,
    isActive: true,
    linkUrl: null,
    shortTextEn: null,
    shortTextEs: null,
    startsOn: null,
    textEn: null,
    textEs: `Nunca guardado ${randomUUID()}`,
  };
}

/**
 * The request's context as `/api/orpc` builds it from the browser's
 * cookies: a fresh login's, signed in for real, or nobody's.
 */
async function setup({ signedIn = true }: { signedIn?: boolean } = {}) {
  let cookie = "";
  let userId: string | null = null;

  if (signedIn) {
    const email = `home-${randomUUID()}@example.test`;
    const password = "synthetic-pass-123";
    const account = await createAccount(auth, db, {
      email,
      name: "Home Test",
      password,
    });
    createdUserIds.push(account.id);
    userId = account.id;
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    cookie = headers
      .getSetCookie()
      .map((setCookie) => setCookie.split(";")[0])
      .join("; ");
  }

  const context = await createORPCContext({ headers: new Headers({ cookie }) });

  return {
    get: async () => await call(homeRouter.get, undefined, { context }),
    removeLogin: async () => {
      if (userId) {
        await db.delete(user).where(eq(user.id, userId));
      }
    },
    saveAnnouncement: async (input: unknown) =>
      await call(homeRouter.saveAnnouncement, input as never, { context }),
  };
}

/** The store's announcement texts now, to see a refused write left none. */
async function savedTexts() {
  const found = await db.query.announcement.findFirst({
    columns: {},
    where: eq(announcement.storeId, await theStoreId(db)),
    with: { translations: { columns: { text: true } } },
  });

  return found?.translations.map((row) => row.text) ?? [];
}

describe("the home's procedures against the database", () => {
  test("an anonymous request reads and writes nothing", async () => {
    const { get, saveAnnouncement } = await setup({ signedIn: false });
    const refused = makeAnnouncement();

    await expect(get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    await expect(saveAnnouncement(refused)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(await savedTexts()).not.toContain(refused.textEs);
  });

  test("a login removed after signing in is refused, though its session cookie lives on", async () => {
    const { get, removeLogin, saveAnnouncement } = await setup();
    await removeLogin();
    const refused = makeAnnouncement();

    await expect(get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    await expect(saveAnnouncement(refused)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(await savedTexts()).not.toContain(refused.textEs);
  });

  test("an admin reads the store's curation, on the business day in Montevideo", async () => {
    // 01:30 in UTC is still the evening before in Montevideo.
    vi.setSystemTime(new Date("2026-12-06T01:30:00.000Z"));
    const { get } = await setup();

    const curation = await get();

    expect(curation.today).toBe("2026-12-05");
    expect(curation.currencyCode).toBe("UYU");
    // The sequence always holds the two curated rows.
    expect(curation.sections).toContainEqual({ kind: "best_sellers" });
    expect(curation.sections).toContainEqual({ kind: "featured" });
  });
});
