import { randomUUID } from "node:crypto";

import { call } from "@orpc/server";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { comingSoonRouter } from "@/server/api/routers/coming-soon";
import { createAccount } from "@/server/better-auth/accounts";
import { isAdminRequest } from "@/server/better-auth/admin-request";
import { auth } from "@/server/better-auth/config";
import { type DatabaseClient, db } from "@/server/db";
import { comingSoon, comingSoonTranslation, user } from "@/server/db/schema";
import { theStoreId } from "@/server/test/one-store";
import {
  backendPid,
  deferred,
  readyOrFailed,
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilBlockedBy,
} from "@/server/test/two-writers";

import {
  addComingSoonIfMissing,
  findComingSoon,
  isComingSoonPublished,
  setComingSoonPublished,
  updateComingSoon,
} from "./coming-soon";

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

// Next's tag cache only exists inside a Next request.
vi.mock("@/server/cache/coming-soon", () => ({
  invalidateComingSoonCache: () => undefined,
}));

type Row = typeof comingSoon.$inferSelect;
type TextRow = typeof comingSoonTranslation.$inferSelect;

// The page is one row for the store, shared by every file of this worker
// (and seeded unpublished when the database the clone came from was). Each
// test changes it freely; `setup()` keeps it as it was for the cleanup.
const snapshots: { page: Row | undefined; texts: TextRow[] }[] = [];
// The logins this file created, deleted after each test with their sessions.
const createdUserIds: string[] = [];

afterEach(async () => {
  // A held writer still holds the page's row: let it finish first.
  await releaseHeldWriters();
  await db.delete(user).where(inArray(user.id, createdUserIds.splice(0)));

  for (const { page, texts } of snapshots.splice(0)) {
    // Deleting the page deletes its texts; both come back as they were.
    await db.delete(comingSoon);

    if (page) {
      await db.insert(comingSoon).values(page);
    }

    if (texts.length > 0) {
      await db.insert(comingSoonTranslation).values(texts);
    }
  }
});

/** The store's id, the page as it is now kept, and none from here on. */
async function setup() {
  const storeId = await theStoreId(db);
  const [page] = await db.select().from(comingSoon);
  const texts = await db.select().from(comingSoonTranslation);
  snapshots.push({ page, texts });
  // Every test starts where production does the day this ships: no row.
  await db.delete(comingSoon);

  return { storeId };
}

/** A login that can sign in, with the cookies its sign-in set. */
async function signIn() {
  const email = `coming-soon-${randomUUID()}@example.test`;
  const password = "synthetic-pass-123";
  const account = await createAccount(auth, db, {
    email,
    name: "Coming Soon Test",
    password,
  });
  createdUserIds.push(account.id);
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");

  return { cookie, userId: account.id };
}

describe("the coming-soon page in the database", () => {
  test("a database the migrations just reached is closed: no row reads as published", async () => {
    await setup();

    await expect(isComingSoonPublished(db)).resolves.toBe(true);
    await expect(findComingSoon(db)).resolves.toEqual({
      countdownTo: null,
      published: true,
      translations: [],
    });
  });

  test("the first save of texts keeps the page published; the switch alone opens the store", async () => {
    const { storeId } = await setup();

    await updateComingSoon(db, storeId, {
      countdownTo: "2026-12-20",
      translations: [
        {
          eyebrow: null,
          headline: "Abrimos",
          lead: null,
          locale: "es",
          marquee: null,
        },
      ],
    });
    await expect(isComingSoonPublished(db)).resolves.toBe(true);

    await expect(setComingSoonPublished(db, storeId, false)).resolves.toEqual({
      published: false,
    });
    await expect(isComingSoonPublished(db)).resolves.toBe(false);
    // The flip left the texts and the day as they were.
    await expect(findComingSoon(db)).resolves.toEqual({
      countdownTo: "2026-12-20",
      published: false,
      translations: [
        {
          eyebrow: null,
          headline: "Abrimos",
          lead: null,
          locale: "es",
          marquee: null,
        },
      ],
    });
  });

  test("a save replaces the texts language by language, and one left out is gone", async () => {
    const { storeId } = await setup();

    await updateComingSoon(db, storeId, {
      countdownTo: null,
      translations: [
        {
          eyebrow: "Feria · 5 de diciembre",
          headline: "Abrimos",
          lead: "Hola",
          locale: "es",
          marquee: null,
        },
        {
          eyebrow: null,
          headline: "Opening",
          lead: null,
          locale: "en",
          marquee: "Jewelry",
        },
      ],
    });
    const saved = await updateComingSoon(db, storeId, {
      countdownTo: "2027-01-02",
      translations: [
        {
          eyebrow: "Feria · 2 de enero",
          headline: null,
          lead: "Chau",
          locale: "es",
          marquee: "Bijou",
        },
      ],
    });

    expect(saved).toEqual({
      countdownTo: "2027-01-02",
      published: true,
      translations: [
        {
          eyebrow: "Feria · 2 de enero",
          headline: null,
          lead: "Chau",
          locale: "es",
          marquee: "Bijou",
        },
      ],
    });
    await expect(findComingSoon(db)).resolves.toEqual(saved);
    await expect(
      db.select({ id: comingSoon.id }).from(comingSoon)
    ).resolves.toHaveLength(1);
  });

  test.each([
    ["eyebrow", 80],
    ["headline", 50],
    ["lead", 240],
    ["marquee", 120],
  ] as const)(
    "the database keeps a %s of exactly %i characters and refuses one more, whatever writes it",
    async (column, limit) => {
      const { storeId } = await setup();
      const [page] = await db
        .insert(comingSoon)
        .values({ storeId })
        .returning({ id: comingSoon.id });
      const comingSoonId = page?.id ?? 0;

      await db
        .insert(comingSoonTranslation)
        .values({ comingSoonId, [column]: "x".repeat(limit), locale: "es" });
      await expect(
        db
          .select({ text: comingSoonTranslation[column] })
          .from(comingSoonTranslation)
          .where(eq(comingSoonTranslation.comingSoonId, comingSoonId))
      ).resolves.toEqual([{ text: "x".repeat(limit) }]);

      await expect(
        db.insert(comingSoonTranslation).values({
          comingSoonId,
          [column]: "x".repeat(limit + 1),
          locale: "en",
        })
      ).rejects.toMatchObject({
        cause: { constraint: `coming_soon_translation_${column}_length` },
      });
    }
  );

  test("the seed's insert opens a fresh store and never undoes a choice", async () => {
    const { storeId } = await setup();

    await expect(
      addComingSoonIfMissing(db, { published: false, storeId })
    ).resolves.toBe(true);
    await expect(isComingSoonPublished(db)).resolves.toBe(false);

    await setComingSoonPublished(db, storeId, true);
    await expect(
      addComingSoonIfMissing(db, { published: false, storeId })
    ).resolves.toBe(false);
    await expect(isComingSoonPublished(db)).resolves.toBe(true);
  });
});

/**
 * Two admins pressing at once: `first` writes in a transaction held open,
 * `second` starts in its own, and the first commits only once Postgres says
 * the second waits on it.
 */
async function overlap(
  first: (tx: DatabaseClient) => Promise<unknown>,
  second: (tx: DatabaseClient) => Promise<unknown>
) {
  const held = deferred();
  const firstPid = deferred<number>();
  const secondPid = deferred<number>();
  const one = db.transaction(async (tx) => {
    await first(tx);
    firstPid.resolve(await backendPid(tx));
    await held.promise;
  });
  const holder = await readyOrFailed(firstPid.promise, one);
  const two = db.transaction(async (tx) => {
    secondPid.resolve(await backendPid(tx));
    await second(tx);
  });
  releaseOnTeardown(
    () => {
      held.resolve(undefined);
    },
    async () => await Promise.allSettled([one, two])
  );
  const waiter = await readyOrFailed(secondPid.promise, two);

  await waitUntilBlockedBy(db, waiter, holder);
  held.resolve(undefined);
  await Promise.all([one, two]);
}

/** A save in both languages, then one in Spanish only, as two admins send them. */
const BOTH_LANGUAGES = {
  countdownTo: "2026-12-20",
  translations: [
    {
      eyebrow: null,
      headline: "Abrimos",
      lead: "Hola",
      locale: "es" as const,
      marquee: null,
    },
    {
      eyebrow: null,
      headline: "Opening",
      lead: "Hello",
      locale: "en" as const,
      marquee: "Jewelry",
    },
  ],
};
const SPANISH_ONLY = {
  countdownTo: "2027-01-02",
  translations: [
    {
      eyebrow: "Feria · 2 de enero",
      headline: null,
      lead: "Chau",
      locale: "es" as const,
      marquee: "Bijou",
    },
  ],
};

describe("two writers at once", () => {
  test("a save that starts while another holds the page waits for it, and the page is wholly the second's, never a mix of their languages", async () => {
    const { storeId } = await setup();
    // The page's row is there: only its lock keeps the second save's delete
    // from running before the first's new language is visible to it.
    await addComingSoonIfMissing(db, { published: true, storeId });

    await overlap(
      async (tx) => await updateComingSoon(tx, storeId, BOTH_LANGUAGES),
      async (tx) => await updateComingSoon(tx, storeId, SPANISH_ONLY)
    );

    await expect(findComingSoon(db)).resolves.toEqual({
      ...SPANISH_ONLY,
      published: true,
    });
  });

  test.each([
    ["a save waits for a flip", "flip", "save"],
    ["a flip waits for a save", "save", "flip"],
  ] as const)(
    "%s, and both survive: the texts saved and the store opened",
    async (_name, first, second) => {
      const { storeId } = await setup();
      await addComingSoonIfMissing(db, { published: true, storeId });
      const writes = {
        flip: async (tx: DatabaseClient) =>
          await setComingSoonPublished(tx, storeId, false),
        save: async (tx: DatabaseClient) =>
          await updateComingSoon(tx, storeId, SPANISH_ONLY),
      };

      await overlap(writes[first], writes[second]);

      await expect(findComingSoon(db)).resolves.toEqual({
        ...SPANISH_ONLY,
        published: false,
      });
    }
  );
});

describe("who may see and flip it", () => {
  test("a signed-in login is vouched for by its session in the database; a forged or removed one is not", async () => {
    await setup();
    const { cookie, userId } = await signIn();

    await expect(isAdminRequest(new Headers({ cookie }))).resolves.toBe(true);
    await expect(
      isAdminRequest(
        new Headers({ cookie: "better-auth.session_token=forged.signature" })
      )
    ).resolves.toBe(false);

    await db.delete(user).where(eq(user.id, userId));
    await expect(isAdminRequest(new Headers({ cookie }))).resolves.toBe(false);
  });

  test("the switch's procedure refuses a signed-out caller and a removed login, and flips it for a login", async () => {
    await setup();
    const { userId } = await signIn();
    const as = (session: { user: { id: string } } | null) => ({
      context: { db, headers: new Headers(), session } as never,
    });

    await expect(
      call(comingSoonRouter.setPublished, { published: false }, as(null))
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(isComingSoonPublished(db)).resolves.toBe(true);

    await expect(
      call(
        comingSoonRouter.setPublished,
        { published: false },
        as({ user: { id: userId } })
      )
    ).resolves.toEqual({ published: false });
    await expect(isComingSoonPublished(db)).resolves.toBe(false);

    await db.delete(user).where(eq(user.id, userId));
    await expect(
      call(
        comingSoonRouter.setPublished,
        { published: true },
        as({ user: { id: userId } })
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(isComingSoonPublished(db)).resolves.toBe(false);
  });
});
