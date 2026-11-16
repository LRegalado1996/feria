import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { UpdateStoreValues } from "@/lib/schemas/store";
import { db } from "@/server/db";
import { store, storeTranslation } from "@/server/db/schema";
import { theStoreId } from "@/server/test/one-store";

import { addMissingStoreTexts, findStore, updateStore } from "./store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const SPANISH = {
  description: "Anillos y cadenas.",
  locale: "es",
  tagline: "Hola",
} as const;
const ENGLISH = {
  description: "Rings and chains.",
  locale: "en",
  tagline: "Hello",
} as const;

// The store is the table's one row, shared by every file of this worker:
// each test edits it freely, and `setup()` keeps it as it was, columns and
// texts, for the cleanup to put back.
const snapshots: {
  columns: Omit<typeof store.$inferSelect, "createdAt" | "id" | "updatedAt">;
  id: number;
  texts: { description: string; locale: "en" | "es"; tagline: string }[];
}[] = [];

afterEach(async () => {
  for (const { columns, id, texts } of snapshots.splice(0)) {
    await db.update(store).set(columns).where(eq(store.id, id));
    await db.delete(storeTranslation).where(eq(storeTranslation.storeId, id));

    if (texts.length > 0) {
      await db
        .insert(storeTranslation)
        .values(texts.map((text) => ({ ...text, storeId: id })));
    }
  }
});

/**
 * The store's id, with the store as it is now kept, to be put back after the
 * test.
 */
async function setup() {
  const id = await theStoreId(db);
  const [columns] = await db
    .select({
      currencyCode: store.currencyCode,
      instagramUrl: store.instagramUrl,
      name: store.name,
      tiktokUrl: store.tiktokUrl,
      whatsappNumber: store.whatsappNumber,
    })
    .from(store)
    .where(eq(store.id, id));

  if (!columns) {
    throw new Error("The store's row is gone");
  }

  snapshots.push({ columns, id, texts: await textsOf(id) });

  return { id };
}

function makeValues(
  overrides: Partial<UpdateStoreValues> = {}
): UpdateStoreValues {
  return {
    currencyCode: "USD",
    instagramUrl: "https://instagram.com/sample",
    name: "Integration Store",
    tiktokUrl: null,
    translations: [SPANISH, ENGLISH],
    whatsappNumber: "+59899123456",
    ...overrides,
  };
}

/**
 * Resolves once a statement on this database is waiting on another session's
 * lock. Asked of Postgres itself, query after query: no sleep, and a bound so
 * a writer that never blocks fails the test instead of hanging it.
 */
async function waitUntilBlocked() {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const result = await db.execute<{ blocked: number }>(sql`
      select count(*)::int as blocked
      from pg_stat_activity
      where datname = current_database()
        and cardinality(pg_blocking_pids(pid)) > 0
    `);

    if ((result.rows[0]?.blocked ?? 0) > 0) {
      return;
    }
  }

  throw new Error("The second writer never waited on the first one's lock");
}

/** The store's texts, Spanish first (the locale type's order). */
async function textsOf(storeId: number) {
  return await db.query.storeTranslation.findMany({
    columns: { description: true, locale: true, tagline: true },
    orderBy: storeTranslation.locale,
    where: eq(storeTranslation.storeId, storeId),
  });
}

describe("the store's row", () => {
  test("is the one store the site reads, with its texts", async () => {
    const { id } = await setup();
    await updateStore(db, makeValues({ translations: [SPANISH] }));

    await expect(findStore(db)).resolves.toEqual({
      currencyCode: "USD",
      id,
      instagramUrl: "https://instagram.com/sample",
      name: "Integration Store",
      tiktokUrl: null,
      translations: [SPANISH],
      whatsappNumber: "+59899123456",
    });
  });

  test("the database refuses a second store, written straight into the table", async () => {
    await setup();
    await expect(findStore(db)).resolves.not.toBeNull();

    await expect(
      db
        .insert(store)
        .values({ currencyCode: "UYU", name: "Another store" })
        .returning({ id: store.id })
    ).rejects.toMatchObject({
      cause: { code: "23505", constraint: "store_single_row" },
    });
    expect(
      await db.select({ count: sql<number>`count(*)::int` }).from(store)
    ).toEqual([{ count: 1 }]);
  });

  test("the database refuses a second text in a language the store already has", async () => {
    const { id } = await setup();
    await updateStore(db, makeValues({ translations: [SPANISH] }));

    await expect(
      db.insert(storeTranslation).values({ ...SPANISH, storeId: id })
    ).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "store_translation_storeId_locale_unique",
      },
    });
  });
});

describe("updateStore", () => {
  test("replaces the columns and the texts: one rewritten, one removed, one added", async () => {
    const { id } = await setup();
    await updateStore(db, makeValues({ translations: [SPANISH] }));

    const updated = await updateStore(
      db,
      makeValues({
        currencyCode: "UYU",
        name: "Renamed",
        translations: [{ ...ENGLISH, tagline: "Hello again" }],
        whatsappNumber: null,
      })
    );

    expect(updated).toEqual({
      currencyCode: "UYU",
      id,
      instagramUrl: "https://instagram.com/sample",
      name: "Renamed",
      tiktokUrl: null,
      translations: [{ ...ENGLISH, tagline: "Hello again" }],
      whatsappNumber: null,
    });
    expect(await textsOf(id)).toEqual([{ ...ENGLISH, tagline: "Hello again" }]);
  });

  test("rewrites a text in place: the same row, with the new words", async () => {
    const { id } = await setup();
    await updateStore(db, makeValues({ translations: [SPANISH] }));
    const [before] = await db.query.storeTranslation.findMany({
      columns: { id: true },
      where: eq(storeTranslation.storeId, id),
    });

    await updateStore(
      db,
      makeValues({ translations: [{ ...SPANISH, tagline: "Hola de nuevo" }] })
    );

    await expect(
      db.query.storeTranslation.findMany({
        columns: { id: true, tagline: true },
        where: eq(storeTranslation.storeId, id),
      })
    ).resolves.toEqual([{ id: before?.id, tagline: "Hola de nuevo" }]);
  });

  test("two edits of the store at once leave one of them whole, never a mixture", async () => {
    const { id } = await setup();
    await updateStore(db, makeValues({ translations: [SPANISH, ENGLISH] }));
    const first = makeValues({
      name: "First edit",
      translations: [{ ...SPANISH, tagline: "Primera" }],
    });
    const second = makeValues({
      name: "Second edit",
      translations: [{ ...ENGLISH, tagline: "Second" }],
    });

    // The first edit holds its transaction open after writing. The second
    // starts then, and must wait on the store's row before touching a text.
    const { waiting } = await db.transaction(async (tx) => {
      await updateStore(tx, first);
      const secondEdit = updateStore(db, second);
      await waitUntilBlocked();

      // Still the first edit's texts: the second has written nothing yet.
      expect(
        await tx.query.storeTranslation.findMany({
          columns: { locale: true, tagline: true },
          where: eq(storeTranslation.storeId, id),
        })
      ).toEqual([{ locale: "es", tagline: "Primera" }]);

      // In an object: returned bare, the promise would be awaited here, by
      // the transaction it is waiting for.
      return { waiting: secondEdit };
    });
    await waiting;

    await expect(
      db.query.store.findFirst({
        columns: { name: true },
        where: eq(store.id, id),
      })
    ).resolves.toEqual({ name: "Second edit" });
    expect(await textsOf(id)).toEqual([{ ...ENGLISH, tagline: "Second" }]);
  });
});

describe("addMissingStoreTexts", () => {
  test("adds a text in each language the store has none in, and leaves the one it has as it was", async () => {
    const { id } = await setup();
    await updateStore(db, makeValues({ translations: [SPANISH] }));

    await expect(
      addMissingStoreTexts(db, {
        storeId: id,
        translations: [{ ...SPANISH, tagline: "Otra" }, ENGLISH],
      })
    ).resolves.toEqual(["en"]);
    expect(await textsOf(id)).toEqual([SPANISH, ENGLISH]);
  });
});
