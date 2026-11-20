import { describe, expect, test, vi } from "vitest";

import { updateStoreSchema } from "@/lib/schemas/store";
import { comingSoon, storeTranslation } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { isLocalDatabase, SEED_STORE_TEXTS, SEED_USER, seed } from "./seed";

const { createAccount } = vi.hoisted(() => ({
  createAccount: vi.fn(
    async (_auth: unknown, _db: unknown, values: { email: string }) => ({
      email: values.email,
      id: `id:${values.email}`,
      name: "Seeded",
    })
  ),
}));

vi.mock("@/server/better-auth/accounts", () => ({ createAccount }));

const PAGES = { covers: 7, grouped: 4, groups: 1 };

const { seedCatalog, seedCatalogPages } = vi.hoisted(() => ({
  seedCatalog: vi.fn(async (_tx: unknown, _storeId: number) => 11),
  seedCatalogPages: vi.fn(async (_tx: unknown, _storeId: number) => ({
    covers: 7,
    grouped: 4,
    groups: 1,
  })),
}));

vi.mock("./seed-catalog", () => ({ seedCatalog, seedCatalogPages }));

const HOME = { announcement: true, banners: 5, featured: 4, ranking: 8 };

const { seedHome } = vi.hoisted(() => ({
  seedHome: vi.fn(async (_tx: unknown, _storeId: number) => ({
    announcement: true,
    banners: 5,
    featured: 4,
    ranking: 8,
  })),
}));

vi.mock("./seed-home", () => ({ seedHome }));

const { seedPages } = vi.hoisted(() => ({
  seedPages: vi.fn(async (_tx: unknown, _storeId: number) => true),
}));

vi.mock("./seed-pages", () => ({ seedPages }));

const LOCAL_URL = "postgresql://feria:secret@localhost:5432/feria";
const REMOTE_URL =
  "postgresql://app:secret@ep-qa-123.us-east-2.aws.neon.tech/feria";
const STORE_ID = 11;

function setup({
  addedLocales = ["es", "en"],
  databaseUrl = LOCAL_URL,
  loginExists = false,
  storeExists = true,
}: {
  /** The languages the store had no text in, which the seed's insert adds. */
  addedLocales?: string[];
  databaseUrl?: string;
  loginExists?: boolean;
  /** Whether the migrations created the store's row. */
  storeExists?: boolean;
} = {}) {
  const db = createMockDatabase();
  const auth = { $context: Promise.resolve({}) };
  db.query.store.findFirst.mockResolvedValue(
    storeExists
      ? { id: STORE_ID, name: "LR Market", translations: [] }
      : undefined
  );
  db.query.user.findFirst.mockResolvedValue(
    loginExists ? { id: "old-login" } : undefined
  );
  db.$["insert.returning"].mockResolvedValue(
    addedLocales.map((locale) => ({ locale }))
  );

  return {
    auth,
    db,
    run: async (nodeEnv: string | undefined) =>
      await seed({
        auth: auth as never,
        databaseUrl,
        db: db as never,
        nodeEnv,
      }),
  };
}

describe("seed", () => {
  test("refuses production before touching the database or Better Auth", async () => {
    const { db, run } = setup();

    await expect(run("production")).rejects.toThrow(
      "db:seed refuses to run with NODE_ENV=production"
    );
    expect(db.query.store.findFirst).not.toHaveBeenCalled();
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
  });

  test.each(["development", "test", undefined])(
    "runs with NODE_ENV %s",
    async (nodeEnv) => {
      const { run } = setup();

      await expect(run(nodeEnv)).resolves.toEqual({
        catalogPages: PAGES,
        createdAccounts: ["test@example.com"],
        createdArticles: 11,
        createdStoreTexts: ["es", "en"],
        examplePage: true,
        home: HOME,
        openedStore: true,
      });
    }
  );

  test("creates the one documented login through Better Auth, and no other", async () => {
    const { auth, db, run } = setup();

    await run("development");

    expect(createAccount.mock.calls).toEqual([
      [
        auth,
        db,
        {
          email: "test@example.com",
          name: "Test User",
          password: "password123",
        },
      ],
    ]);
  });

  test("looks the login up by its email first, and leaves one that exists alone", async () => {
    const { db, run } = setup({ loginExists: true });

    await expect(run("test")).resolves.toMatchObject({ createdAccounts: [] });

    const [config] = db.query.user.findFirst.mock.calls[0] ?? [];
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      sql: '"user"."email" = $1',
      params: ["test@example.com"],
    });
    expect(createAccount).not.toHaveBeenCalled();
    // Nothing about it is rewritten: the seed gives no role.
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("on a remote database (qa) creates no login, and still gives the store its texts and catalog", async () => {
    const { db, run } = setup({ databaseUrl: REMOTE_URL });

    await expect(run("development")).resolves.toEqual({
      catalogPages: PAGES,
      createdAccounts: [],
      createdArticles: 11,
      createdStoreTexts: ["es", "en"],
      examplePage: true,
      home: HOME,
      openedStore: true,
    });
    expect(createAccount).not.toHaveBeenCalled();
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
    expect(seedCatalog).toHaveBeenCalledExactlyOnceWith(db, STORE_ID);
  });

  test("gives the store its texts in the languages it has none in, never over one it has", async () => {
    const { db, run } = setup({ addedLocales: ["en"] });

    await expect(run("test")).resolves.toMatchObject({
      createdStoreTexts: ["en"],
    });

    expect(db.$.insert).toHaveBeenCalledWith(storeTranslation);
    expect(db.$["insert.values"]).toHaveBeenCalledWith(
      SEED_STORE_TEXTS.map((text) => ({ ...text, storeId: STORE_ID }))
    );
    expect(db.$["insert.onConflictDoNothing"]).toHaveBeenCalledWith({
      target: [storeTranslation.storeId, storeTranslation.locale],
    });
  });

  test("opens the store: the coming-soon page unpublished, never over a choice already made", async () => {
    const { db, run } = setup();
    db.$["insert.returning"]
      .mockResolvedValueOnce([{ locale: "es" }])
      .mockResolvedValueOnce([]);

    // The store already had its page: the seed says so and changes nothing.
    await expect(run("development")).resolves.toMatchObject({
      openedStore: false,
    });
    expect(db.$.insert.mock.calls).toEqual([[storeTranslation], [comingSoon]]);
    expect(db.$["insert.values"].mock.calls[1]).toEqual([
      { published: false, storeId: STORE_ID },
    ]);
    expect(db.$["insert.onConflictDoNothing"].mock.calls[1]).toEqual([
      { target: comingSoon.storeId },
    ]);
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("loads the sample catalog into the store, inside a transaction", async () => {
    const { db, run } = setup();
    // The transaction's own handle: the catalog must be written through it.
    const tx = createMockDatabase();
    db.$.transaction.mockImplementation(
      async (callback: unknown) =>
        await (callback as (handle: unknown) => Promise<unknown>)(tx)
    );

    await run("development");

    expect(seedCatalog).toHaveBeenCalledExactlyOnceWith(tx, STORE_ID);
    // The pages after the catalog they are about, in the same transaction.
    expect(seedCatalogPages).toHaveBeenCalledExactlyOnceWith(tx, STORE_ID);
    expect(seedCatalog.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      seedCatalogPages.mock.invocationCallOrder[0] ?? 0
    );
    // The home picks from the catalog: after it, in a transaction of its own.
    expect(seedHome).toHaveBeenCalledExactlyOnceWith(tx, STORE_ID);
    expect(seedCatalogPages.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      seedHome.mock.invocationCallOrder[0] ?? 0
    );
    // The example page (FER-060) after the home, in a transaction of its own.
    expect(seedPages).toHaveBeenCalledExactlyOnceWith(tx, STORE_ID);
    expect(seedHome.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      seedPages.mock.invocationCallOrder[0] ?? 0
    );
    expect(db.$.transaction.mock.calls).toEqual([
      [expect.any(Function)],
      [expect.any(Function)],
      [expect.any(Function)],
    ]);
  });

  test("refuses a database without the store's row, writing nothing", async () => {
    const { db, run } = setup({ storeExists: false });

    await expect(run("development")).rejects.toThrow(
      "db:seed found no store: run the migrations first"
    );
    expect(createAccount).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(seedCatalog).not.toHaveBeenCalled();
    expect(seedCatalogPages).not.toHaveBeenCalled();
    expect(seedHome).not.toHaveBeenCalled();
    expect(seedPages).not.toHaveBeenCalled();
  });

  test("the seed's login is the documented one", () => {
    expect(SEED_USER).toEqual({
      email: "test@example.com",
      name: "Test User",
      password: "password123",
    });
  });

  test("the store's texts are in both languages and pass the rules the settings hold them to", () => {
    expect(SEED_STORE_TEXTS.map(({ locale }) => locale)).toEqual(["es", "en"]);
    // Throws on a text too long, empty, or a language sent twice.
    expect(
      updateStoreSchema.shape.translations.parse(SEED_STORE_TEXTS)
    ).toEqual(SEED_STORE_TEXTS);
  });
});

describe("isLocalDatabase", () => {
  test.each([
    ["postgresql://u:p@localhost:5432/db", true],
    ["postgresql://u:p@127.0.0.1:17892/db", true],
    ["postgresql://u:p@[::1]:5432/db", true],
    ["postgresql://u:p@db:5432/db", true],
    ["postgresql://u:p@postgres:5432/e2e_test", true],
    ["postgresql://u:p@ep-qa-123.us-east-2.aws.neon.tech/db", false],
    ["postgresql://u:p@localhost.example.com/db", false],
    ["not a url", false],
    [undefined, false],
  ])("%s is local: %s", (url, local) => {
    expect(isLocalDatabase(url)).toBe(local);
  });
});
