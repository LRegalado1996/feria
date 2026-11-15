import { describe, expect, test, vi } from "vitest";

import { createStoreSchema } from "@/lib/schemas/store";
import {
  post,
  store,
  storeMember,
  storeTranslation,
  user,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import { renderQuery } from "@/server/test/render-sql";

import { SEED_MEMBERS, SEED_STORES, SEED_USER, seed } from "./seed";

const { createAccount } = vi.hoisted(() => ({
  createAccount: vi.fn(async (_auth: unknown, values: { email: string }) => ({
    email: values.email,
    id: `id:${values.email}`,
    name: "Seeded",
    role: "member" as const,
  })),
}));

vi.mock("@/server/better-auth/accounts", () => ({ createAccount }));

const BOTH_STORES = ["lr-market", "tienda-demo"];
const ALL_EMAILS = [
  "test@example.com",
  "member@example.com",
  "multi@example.com",
];
const STORE_IDS = { "lr-market": 11, "tienda-demo": 12 };

/** The email a `user.findFirst` call looked up, from its bound parameter. */
function emailOf(config: unknown): string {
  return renderQuery((config as { where: unknown }).where).params[0] as string;
}

function setup({
  existingEmails = [],
  postCount = 0,
  takenSlugs = BOTH_STORES,
}: {
  /** The seed logins already in the database, by email. */
  existingEmails?: string[];
  postCount?: number;
  /** The seed stores already in the database: both, unless a test is about them. */
  takenSlugs?: string[];
} = {}) {
  const db = createMockDatabase();
  const auth = { $context: Promise.resolve({}) };
  db.query.user.findFirst.mockImplementation(async (config: unknown) => {
    const email = emailOf(config);
    return existingEmails.includes(email) ? { id: `old:${email}` } : undefined;
  });
  db.$["update.returning"].mockResolvedValue([{ id: "updated" }]);
  db.$["select.from"].mockResolvedValue([{ total: postCount }]);
  // Two reads of the seed stores: which exist (slugs), then their ids.
  db.query.store.findMany.mockImplementation(async (config: unknown) =>
    (config as { columns: Record<string, boolean> }).columns.id
      ? Object.entries(STORE_IDS).map(([slug, id]) => ({ id, slug }))
      : takenSlugs.map((slug) => ({ slug }))
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
    /** The memberships the seed inserted, as (store id, user id) pairs. */
    memberships: () =>
      db.$.insert.mock.calls.flatMap(([table], index) =>
        table === storeMember
          ? [db.$["insert.values"].mock.calls[index]?.[0]]
          : []
      ),
  };
}

describe("seed", () => {
  test("refuses production before touching the database or Better Auth", async () => {
    const { db, run } = setup();

    await expect(run("production")).rejects.toThrow(
      "db:seed refuses to run with NODE_ENV=production"
    );
    expect(db.query.user.findFirst).not.toHaveBeenCalled();
    expect(createAccount).not.toHaveBeenCalled();
  });

  test.each(["development", "test", undefined])(
    "runs with NODE_ENV %s",
    async (nodeEnv) => {
      const { run } = setup();

      await expect(run(nodeEnv)).resolves.toEqual({
        createdAccounts: ALL_EMAILS,
        createdPost: true,
        createdStores: [],
      });
    }
  );

  test("creates a superadmin and two members through Better Auth, with the documented password", async () => {
    const { auth, run } = setup();

    await run("development");

    expect(createAccount.mock.calls).toEqual([
      [
        auth,
        {
          email: "test@example.com",
          name: "Test User",
          password: "password123",
          role: "superadmin",
        },
      ],
      [
        auth,
        {
          email: "member@example.com",
          name: "Store Member",
          password: "password123",
          role: "member",
        },
      ],
      [
        auth,
        {
          email: "multi@example.com",
          name: "Two Stores Member",
          password: "password123",
          role: "member",
        },
      ],
    ]);
  });

  test("makes the first member a member of one store and the second of both", async () => {
    const { memberships, run } = setup();

    await run("development");

    expect(memberships()).toEqual([
      { storeId: 11, userId: "id:member@example.com" },
      { storeId: 11, userId: "id:multi@example.com" },
      { storeId: 12, userId: "id:multi@example.com" },
    ]);
  });

  test("posts as the superadmin on an empty feed", async () => {
    const { db, run } = setup();

    await run("development");

    expect(db.$.insert).toHaveBeenCalledWith(post);
    expect(db.$["insert.values"]).toHaveBeenCalledWith({
      name: "Welcome to the feed!",
      createdById: "id:test@example.com",
    });
  });

  test("gives existing logins their seed role instead of creating them again", async () => {
    const { db, run } = setup({ existingEmails: ALL_EMAILS, postCount: 1 });

    await expect(run("test")).resolves.toEqual({
      createdAccounts: [],
      createdPost: false,
      createdStores: [],
    });
    expect(createAccount).not.toHaveBeenCalled();
    expect(db.$.update).toHaveBeenCalledWith(user);
    expect(db.$["update.set"].mock.calls).toEqual([
      [{ role: "superadmin" }],
      [{ role: "member" }],
      [{ role: "member" }],
    ]);
  });

  test("leaves the feed alone when it has a post", async () => {
    const { db, run } = setup({ existingEmails: ALL_EMAILS, postCount: 1 });

    await run("test");

    expect(db.$.insert).not.toHaveBeenCalledWith(post);
  });

  test("every seed login has a store to land in, except the superadmin who needs none", () => {
    expect(
      [SEED_USER, ...SEED_MEMBERS].map(({ role, stores }) => [role, stores])
    ).toEqual([
      ["superadmin", []],
      ["member", ["lr-market"]],
      ["member", ["lr-market", "tienda-demo"]],
    ]);
  });

  test("creates both stores, with their texts, on a database that has neither", async () => {
    const { db, run } = setup({
      existingEmails: ALL_EMAILS,
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
      [storeMember],
      [storeMember],
      [storeMember],
    ]);
    expect(db.$["insert.values"]).toHaveBeenCalledWith(
      expect.objectContaining({
        colorAccent: "#c8f31d",
        currencyCode: "UYU",
        isActive: true,
        isDefault: true,
        name: "LR Market",
        slug: "lr-market",
      })
    );
    expect(db.$["insert.values"]).toHaveBeenCalledWith(
      expect.objectContaining({
        colorAccent: "#ff8a3d",
        currencyCode: "USD",
        isActive: true,
        isDefault: false,
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
      existingEmails: ALL_EMAILS,
      postCount: 1,
      takenSlugs: ["lr-market"],
    });

    await expect(run("test")).resolves.toMatchObject({
      createdStores: ["tienda-demo"],
    });
    expect(db.$.insert.mock.calls).toEqual([
      [store],
      [storeTranslation],
      [storeMember],
      [storeMember],
      [storeMember],
    ]);
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
