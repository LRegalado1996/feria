import { describe, expect, test, vi } from "vitest";

import { createStoreSchema } from "@/lib/schemas/store";
import { post, store, storeTranslation } from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { SEED_STORES, seed } from "./seed";

const BOTH_STORES = ["lr-market", "tienda-demo"];

function setup({
  existingUserId,
  postCount = 0,
  takenSlugs = BOTH_STORES,
}: {
  existingUserId?: string;
  postCount?: number;
  /** The seed stores already in the database: both, unless a test is about them. */
  takenSlugs?: string[];
} = {}) {
  const db = createMockDatabase();
  const auth = {
    api: {
      signUpEmail: vi.fn(async () => ({ user: { id: "seed-user-id" } })),
    },
  };
  db.query.user.findFirst.mockResolvedValue(
    existingUserId ? { id: existingUserId } : undefined
  );
  db.$["select.from"].mockResolvedValue([{ total: postCount }]);
  db.query.store.findMany.mockResolvedValue(
    takenSlugs.map((slug) => ({ slug }))
  );
  // A store's insert answers with the row it was given; nothing else is read back.
  const inserted: unknown[] = [];
  db.$["insert.values"].mockImplementation((values: unknown) => {
    inserted.push(values);
  });
  db.$["insert.returning"].mockImplementation(async (columns: unknown) => {
    const last = inserted.at(-1);

    return await Promise.resolve(
      columns || Array.isArray(last) ? [] : [{ ...(last as object), id: 1 }]
    );
  });

  return {
    auth,
    db,
    run: async (nodeEnv: string | undefined) =>
      await seed({ auth: auth as never, db: db as never, nodeEnv }),
  };
}

describe("seed", () => {
  test("refuses production before touching the database or Better Auth", async () => {
    const { auth, db, run } = setup();

    await expect(run("production")).rejects.toThrow(
      "db:seed refuses to run with NODE_ENV=production"
    );
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
  });

  test.each(["development", "test", undefined])(
    "runs with NODE_ENV %s",
    async (nodeEnv) => {
      const { run } = setup();

      await expect(run(nodeEnv)).resolves.toEqual({
        email: "test@example.com",
        createdUser: true,
        createdPost: true,
        createdStores: [],
      });
    }
  );

  test("signs the documented login up through Better Auth and posts as them on an empty database", async () => {
    const { auth, db, run } = setup();

    await run("development");

    expect(auth.api.signUpEmail).toHaveBeenCalledExactlyOnceWith({
      body: {
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      },
    });
    expect(db.$.insert).toHaveBeenCalledExactlyOnceWith(post);
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      name: "Welcome to the feed!",
      createdById: "seed-user-id",
    });
  });

  test("looks the user up by the seed email", async () => {
    const { db, run } = setup();

    await run("test");

    const lookup = db.query.user.findFirst.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(renderQuery(lookup.where)).toEqual({
      sql: '"user"."email" = $1',
      params: ["test@example.com"],
    });
  });

  test("leaves an existing user and a feed of one post alone on a second run", async () => {
    const { auth, db, run } = setup({
      existingUserId: "existing-id",
      postCount: 1,
    });

    await expect(run("test")).resolves.toEqual({
      email: "test@example.com",
      createdUser: false,
      createdPost: false,
      createdStores: [],
    });
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("posts as an existing user when the feed is empty", async () => {
    const { auth, db, run } = setup({ existingUserId: "existing-id" });

    await expect(run("test")).resolves.toEqual({
      email: "test@example.com",
      createdUser: false,
      createdPost: true,
      createdStores: [],
    });
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
    expect(db.$["insert.values"]).toHaveBeenCalledExactlyOnceWith({
      name: "Welcome to the feed!",
      createdById: "existing-id",
    });
  });

  test("creates both stores, with their texts, on a database that has neither", async () => {
    const { db, run } = setup({
      existingUserId: "existing-id",
      postCount: 1,
      takenSlugs: [],
    });

    await expect(run("test")).resolves.toMatchObject({
      createdStores: ["lr-market", "tienda-demo"],
    });

    expect(db.$.insert.mock.calls).toEqual([
      [store],
      [storeTranslation],
      [store],
      [storeTranslation],
    ]);
    expect(db.$["insert.values"]).toHaveBeenCalledWith(
      expect.objectContaining({
        colorAccent: "#c8f31d",
        currencyCode: "UYU",
        isActive: true,
        name: "LR Market",
        slug: "lr-market",
      })
    );
    expect(db.$["insert.values"]).toHaveBeenCalledWith(
      expect.objectContaining({
        colorAccent: "#ff8a3d",
        currencyCode: "USD",
        isActive: true,
        name: "Tienda Demo",
        slug: "tienda-demo",
      })
    );
  });

  test("asks which seed stores exist in one query, by slug", async () => {
    const { db, run } = setup();

    await run("test");

    const lookup = db.query.store.findMany.mock.calls[0]?.[0] as {
      where: unknown;
    };
    expect(renderQuery(lookup.where)).toEqual({
      sql: '"store"."slug" in ($1, $2)',
      params: ["lr-market", "tienda-demo"],
    });
  });

  test("creates only the store that is missing", async () => {
    const { db, run } = setup({
      existingUserId: "existing-id",
      postCount: 1,
      takenSlugs: ["lr-market"],
    });

    await expect(run("test")).resolves.toMatchObject({
      createdStores: ["tienda-demo"],
    });
    expect(db.$.insert.mock.calls).toEqual([[store], [storeTranslation]]);
  });

  test("every seed store passes the rules the API holds a store to, in two different palettes", () => {
    const palettes = SEED_STORES.map((seedStore) => {
      // Throws on a reserved slug, a malformed color or a pair that fails AA.
      const parsed = createStoreSchema.parse(seedStore);

      return [
        parsed.colorAccent,
        parsed.colorBackground,
        parsed.colorContrast,
        parsed.colorForeground,
        parsed.colorSurface,
      ].join(" ");
    });

    expect(palettes).toEqual([
      "#c8f31d #f2f3f0 #111312 #111312 #ffffff",
      "#ff8a3d #fff4e6 #3d1f47 #26160f #ffffff",
    ]);
  });

  test("every seed store has its texts in both languages and no contact details", () => {
    expect(
      SEED_STORES.map((seedStore) => ({
        contact: [
          seedStore.whatsappNumber,
          seedStore.instagramUrl,
          seedStore.tiktokUrl,
        ],
        locales: seedStore.translations.map(({ locale }) => locale),
      }))
    ).toEqual([
      { contact: [null, null, null], locales: ["es", "en"] },
      { contact: [null, null, null], locales: ["es", "en"] },
    ]);
  });
});
