import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../server/db/schema";
import { post, store, storeTranslation, user } from "../../server/db/schema";
import { test as userTest } from "./user.fixture";

type PostInput = typeof post.$inferInsert;

type CreatedPost = typeof post.$inferSelect;

type CreatedUser = typeof user.$inferSelect;

type StoreInput = typeof store.$inferInsert;

type StoreTextInput = Pick<
  typeof storeTranslation.$inferInsert,
  "description" | "locale" | "tagline"
>;

type CreatedStore = typeof store.$inferSelect;

export interface DbFixture {
  db: {
    drizzle: ReturnType<typeof drizzle<typeof schema>>;
    seed: {
      /**
       * A post by the worker's user unless `createdById` says otherwise, dated
       * now unless `createdAt` says otherwise.
       */
      createPost: (
        overrides?: Partial<
          Pick<PostInput, "createdAt" | "createdById" | "name">
        >
      ) => Promise<CreatedPost>;
      /**
       * A store at an address of its own, active and in the default palette
       * unless `overrides` says otherwise, with the texts given.
       */
      createStore: (
        overrides?: Partial<Omit<StoreInput, "id" | "slug">>,
        texts?: StoreTextInput[]
      ) => Promise<CreatedStore>;
      /** Another user, for "someone else's" cases. */
      createUser: (name: string) => Promise<CreatedUser>;
    };
  };
}

/**
 * Seeds rows for a test and deletes, at teardown, exactly the rows the test
 * created: the ones seeded here, captured as each insert returns, and the
 * ones its pages created through the UI (`createdRows`). Never by name prefix
 * or `LIKE`: those reach a parallel worker's rows. Automatic, so a spec that
 * only clicks still cleans up.
 */
export const test = userTest.extend<DbFixture>({
  db: [
    async ({ createdRows, identity }, use) => {
      const connectionString = process.env.DATABASE_URL;

      if (!connectionString) {
        throw new Error("DATABASE_URL is required for e2e tests");
      }

      const pool = new Pool({ connectionString, max: 2 });
      const db = drizzle(pool, { schema });
      const seededPostIds: number[] = [];
      const seededUserIds: string[] = [];
      const seededStoreIds: number[] = [];

      const seed = {
        createPost: async (
          overrides: Partial<
            Pick<PostInput, "createdAt" | "createdById" | "name">
          > = {}
        ): Promise<CreatedPost> => {
          const [created] = await db
            .insert(post)
            .values({
              name: overrides.name ?? `E2E seeded post ${crypto.randomUUID()}`,
              createdById: overrides.createdById ?? identity.id,
              createdAt: overrides.createdAt,
            })
            .returning();

          if (!created) {
            throw new Error("Inserting a post returned no row");
          }

          seededPostIds.push(created.id);
          return created;
        },

        createStore: async (
          overrides: Partial<Omit<StoreInput, "id" | "slug">> = {},
          texts: StoreTextInput[] = []
        ): Promise<CreatedStore> => {
          const [created] = await db
            .insert(store)
            .values({
              colorAccent: "#c8f31d",
              colorBackground: "#f2f3f0",
              colorContrast: "#111312",
              colorForeground: "#111312",
              colorSurface: "#ffffff",
              currencyCode: "UYU",
              isActive: true,
              name: "E2E Store",
              ...overrides,
              // Never seen before, so no cached page or cached 404 exists for
              // it: 40 characters, the longest a slug may be.
              slug: `e2e-${crypto.randomUUID()}`,
            })
            .returning();

          if (!created) {
            throw new Error("Inserting a store returned no row");
          }

          seededStoreIds.push(created.id);

          if (texts.length > 0) {
            await db
              .insert(storeTranslation)
              .values(texts.map((text) => ({ ...text, storeId: created.id })));
          }

          return created;
        },

        createUser: async (name: string): Promise<CreatedUser> => {
          const id = crypto.randomUUID();
          const [created] = await db
            .insert(user)
            .values({ id, name, email: `e2e-${id}@example.com` })
            .returning();

          if (!created) {
            throw new Error("Inserting a user returned no row");
          }

          seededUserIds.push(created.id);
          return created;
        },
      };

      try {
        await use({ drizzle: db, seed });
      } finally {
        // A response still being read when the test ended still counts.
        await Promise.all(createdRows.pending);
        await db
          .delete(post)
          .where(
            and(
              inArray(post.id, createdRows.postIds),
              eq(post.createdById, identity.id)
            )
          );
        await db.delete(post).where(inArray(post.id, seededPostIds));
        // Cascades to the stores' texts.
        await db.delete(store).where(inArray(store.id, seededStoreIds));
        // Cascades to the users' sessions, accounts and posts.
        await db.delete(user).where(inArray(user.id, seededUserIds));
        await db
          .delete(user)
          .where(inArray(user.email, createdRows.userEmails));
        await pool.end();
      }

      // After the cleanup, so what could be deleted was.
      if (createdRows.unreadable.length > 0) {
        throw new Error(
          `Rows created through the UI leaked, their ids unreadable: ${createdRows.unreadable.join("; ")}`
        );
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
