import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  type CreateStoreValues,
  RESERVED_STORE_SLUGS,
} from "@/lib/schemas/store";
import { db } from "@/server/db";
import { store, storeTranslation } from "@/server/db/schema";

import {
  createStore,
  findActiveStoreBySlug,
  getActiveStoreBySlug,
  listTakenStoreSlugs,
  updateStore,
} from "./store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The stores this file inserted. Deleting one cascades to its texts, so this
// is the whole cleanup, and it never reaches a row another file owns.
const createdStoreIds: number[] = [];

afterEach(async () => {
  await db.delete(store).where(inArray(store.id, createdStoreIds.splice(0)));
});

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

/** An address no other test or worker holds: 39 characters, inside the limit. */
function uniqueSlug() {
  return `it-${randomUUID()}`;
}

function makeValues(
  overrides: Partial<CreateStoreValues> = {}
): CreateStoreValues {
  return {
    colorAccent: "#c8f31d",
    colorBackground: "#f2f3f0",
    colorContrast: "#111312",
    colorForeground: "#111312",
    colorSurface: "#ffffff",
    currencyCode: "UYU",
    instagramUrl: "https://instagram.com/sample",
    isActive: true,
    logoUrl: null,
    name: "Integration Store",
    slug: uniqueSlug(),
    tiktokUrl: null,
    translations: [SPANISH, ENGLISH],
    whatsappNumber: "+59899123456",
    ...overrides,
  };
}

/** The columns of {@link makeValues}, for an insert that goes around the service. */
function makeRow(overrides: Partial<typeof store.$inferInsert> = {}) {
  const { translations: _translations, ...columns } = makeValues();

  return { ...columns, ...overrides };
}

async function create(overrides: Partial<CreateStoreValues> = {}) {
  const created = await createStore(db, makeValues(overrides));
  createdStoreIds.push(created.id);

  return created;
}

/** Straight into the table, as a script or a console would: no zod in the way. */
async function insertDirectly(row: typeof store.$inferInsert) {
  const [inserted] = await db
    .insert(store)
    .values(row)
    .returning({ id: store.id });

  if (inserted) {
    createdStoreIds.push(inserted.id);
  }

  return inserted;
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

async function textsOf(storeId: number) {
  return await db.query.storeTranslation.findMany({
    columns: { description: true, locale: true, tagline: true },
    orderBy: storeTranslation.locale,
    where: eq(storeTranslation.storeId, storeId),
  });
}

describe("createStore and the public read", () => {
  test("stores a store with its texts, and the public read returns what a page shows", async () => {
    const created = await create();

    const found = await findActiveStoreBySlug(db, created.slug);

    expect(found).toEqual({
      colorAccent: "#c8f31d",
      colorBackground: "#f2f3f0",
      colorContrast: "#111312",
      colorForeground: "#111312",
      colorSurface: "#ffffff",
      currencyCode: "UYU",
      id: created.id,
      instagramUrl: "https://instagram.com/sample",
      logoUrl: null,
      name: "Integration Store",
      slug: created.slug,
      tiktokUrl: null,
      translations: expect.any(Array),
      whatsappNumber: "+59899123456",
    });
    // In whatever order the rows come back.
    expect(new Set(found?.translations)).toEqual(new Set([SPANISH, ENGLISH]));
  });

  test("an inactive store does not exist for a visitor", async () => {
    const created = await create({ isActive: false });

    await expect(findActiveStoreBySlug(db, created.slug)).resolves.toBeNull();
    await expect(
      getActiveStoreBySlug(db, { slug: created.slug })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Store not found" });
  });

  test("an address nobody holds reads as null", async () => {
    await expect(findActiveStoreBySlug(db, uniqueSlug())).resolves.toBeNull();
  });

  test("lists the addresses that are taken, active or not, and only those", async () => {
    const active = await create();
    const inactive = await create({ isActive: false });
    const free = uniqueSlug();

    const taken = await listTakenStoreSlugs(db, [
      active.slug,
      inactive.slug,
      free,
    ]);

    expect(new Set(taken)).toEqual(new Set([active.slug, inactive.slug]));
  });

  test("refuses a second store at an address that is taken, and stores none of it", async () => {
    const first = await create();

    await expect(
      createStore(db, makeValues({ name: "Second", slug: first.slug }))
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another store already uses that address. Choose another one",
    });

    const rows = await db.query.store.findMany({
      columns: { id: true, name: true },
      where: eq(store.slug, first.slug),
    });
    expect(rows).toEqual([{ id: first.id, name: "Integration Store" }]);
    // The refused store's texts went with it: the first store still has two.
    expect(await textsOf(first.id)).toEqual([SPANISH, ENGLISH]);
  });
});

describe("what the database itself refuses", () => {
  test.each(RESERVED_STORE_SLUGS)(
    "the reserved address %s, written straight into the table",
    async (slug) => {
      await expect(insertDirectly(makeRow({ slug }))).rejects.toMatchObject({
        cause: { code: "23514", constraint: "store_slug_not_reserved" },
      });
    }
  );

  test.each([
    ["an uppercase letter", "My-Store"],
    ["one character", "a"],
    ["41 characters", "a".repeat(41)],
    ["Next's asset path", "_next"],
    ["a doubled hyphen", "my--store"],
    ["a trailing hyphen", "store-"],
    ["a dot", "favicon.ico"],
    ["a line break after a valid slug", "store\n"],
  ])("an address with %s", async (_case, slug) => {
    await expect(insertDirectly(makeRow({ slug }))).rejects.toMatchObject({
      cause: { code: "23514", constraint: "store_slug_format" },
    });
  });

  test.each([
    ["the shortest address", () => `i${randomUUID().slice(0, 1)}`],
    [
      "the longest address",
      () => `i${randomUUID().replaceAll("-", "")}${"0".repeat(7)}`,
    ],
  ])("but it accepts %s", async (_case, makeSlug) => {
    const slug = makeSlug();

    const inserted = await insertDirectly(makeRow({ slug }));

    await expect(
      db.query.store.findFirst({
        columns: { slug: true },
        where: eq(store.id, inserted?.id ?? 0),
      })
    ).resolves.toEqual({ slug });
  });

  test("a duplicate address, written straight into the table", async () => {
    const first = await create();

    await expect(
      insertDirectly(makeRow({ slug: first.slug }))
    ).rejects.toMatchObject({
      cause: { code: "23505", constraint: "store_slug_unique" },
    });
  });

  test.each([
    ["colorBackground", "store_color_background_hex"],
    ["colorSurface", "store_color_surface_hex"],
    ["colorForeground", "store_color_foreground_hex"],
    ["colorContrast", "store_color_contrast_hex"],
    ["colorAccent", "store_color_accent_hex"],
  ] as const)("a %s that is not a hex color", async (column, constraint) => {
    await expect(
      insertDirectly(makeRow({ [column]: "red", slug: uniqueSlug() }))
    ).rejects.toMatchObject({ cause: { code: "23514", constraint } });
  });

  test.each([
    ["uppercase digits", "#C8F31D"],
    ["three digits", "#fff"],
    ["a value that goes on after the color", "#c8f31d;color:red"],
  ])("an accent written with %s", async (_case, colorAccent) => {
    await expect(
      insertDirectly(makeRow({ colorAccent, slug: uniqueSlug() }))
    ).rejects.toMatchObject({
      cause: { code: "23514", constraint: "store_color_accent_hex" },
    });
  });

  test("a second text in a language the store already has", async () => {
    const created = await create({ translations: [SPANISH] });

    await expect(
      db.insert(storeTranslation).values({ ...SPANISH, storeId: created.id })
    ).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "store_translation_storeId_locale_unique",
      },
    });
  });

  test("deleting a store takes its texts with it", async () => {
    const created = await create();

    await db.delete(store).where(eq(store.id, created.id));

    expect(await textsOf(created.id)).toEqual([]);
  });
});

describe("updateStore", () => {
  test("replaces the columns and the texts: one rewritten, one removed, one added", async () => {
    const created = await create({ translations: [SPANISH] });
    const renamed = uniqueSlug();

    const updated = await updateStore(db, {
      ...makeValues({
        colorAccent: "#ff8a3d",
        isActive: false,
        name: "Renamed",
        slug: renamed,
        translations: [{ ...ENGLISH, tagline: "Hello again" }],
        whatsappNumber: null,
      }),
      id: created.id,
    });

    expect(updated).toMatchObject({
      colorAccent: "#ff8a3d",
      id: created.id,
      isActive: false,
      name: "Renamed",
      slug: renamed,
      translations: [{ ...ENGLISH, tagline: "Hello again" }],
      whatsappNumber: null,
    });
    expect(await textsOf(created.id)).toEqual([
      { ...ENGLISH, tagline: "Hello again" },
    ]);
  });

  test("rewrites a text in place: the same row, with the new words", async () => {
    const created = await create({ translations: [SPANISH] });
    const [before] = await db.query.storeTranslation.findMany({
      columns: { id: true },
      where: eq(storeTranslation.storeId, created.id),
    });

    await updateStore(db, {
      ...makeValues({
        slug: created.slug,
        translations: [{ ...SPANISH, tagline: "Hola de nuevo" }],
      }),
      id: created.id,
    });

    await expect(
      db.query.storeTranslation.findMany({
        columns: { id: true, tagline: true },
        where: eq(storeTranslation.storeId, created.id),
      })
    ).resolves.toEqual([{ id: before?.id, tagline: "Hola de nuevo" }]);
  });

  test("leaves another store's texts alone", async () => {
    const edited = await create();
    const other = await create();

    await updateStore(db, {
      ...makeValues({ slug: edited.slug, translations: [] }),
      id: edited.id,
    });

    expect(await textsOf(edited.id)).toEqual([]);
    expect(await textsOf(other.id)).toEqual([SPANISH, ENGLISH]);
  });

  test("refuses another store's address and changes nothing, texts included", async () => {
    const edited = await create();
    const other = await create();

    await expect(
      updateStore(db, {
        ...makeValues({ name: "Hijacked", slug: other.slug, translations: [] }),
        id: edited.id,
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Another store already uses that address. Choose another one",
    });

    await expect(
      db.query.store.findFirst({
        columns: { name: true, slug: true },
        where: eq(store.id, edited.id),
      })
    ).resolves.toEqual({ name: "Integration Store", slug: edited.slug });
    expect(await textsOf(edited.id)).toEqual([SPANISH, ENGLISH]);
  });

  test("two edits of one store at once leave one of them whole, never a mixture", async () => {
    const created = await create({ translations: [SPANISH, ENGLISH] });
    const first = {
      ...makeValues({
        name: "First edit",
        slug: created.slug,
        translations: [{ ...SPANISH, tagline: "Primera" }],
      }),
      id: created.id,
    };
    const second = {
      ...makeValues({
        name: "Second edit",
        slug: created.slug,
        translations: [{ ...ENGLISH, tagline: "Second" }],
      }),
      id: created.id,
    };

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
          where: eq(storeTranslation.storeId, created.id),
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
        where: eq(store.id, created.id),
      })
    ).resolves.toEqual({ name: "Second edit" });
    expect(await textsOf(created.id)).toEqual([
      { ...ENGLISH, tagline: "Second" },
    ]);
  });

  test("answers NOT_FOUND for an id no store has", async () => {
    const created = await create();
    await db.delete(store).where(eq(store.id, created.id));

    await expect(
      updateStore(db, { ...makeValues(), id: created.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Store not found" });
  });
});
