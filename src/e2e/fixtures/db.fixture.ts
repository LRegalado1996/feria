import { hashPassword } from "better-auth/crypto";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../server/db/schema";
import {
  account,
  attribute,
  attributeTranslation,
  attributeValue,
  attributeValueTranslation,
  category,
  categoryTranslation,
  product,
  productAttributeValue,
  productImage,
  productTranslation,
  store,
  storeMember,
  storeTranslation,
  user,
} from "../../server/db/schema";
import { test as userTest } from "./user.fixture";

/**
 * A published article: with a price it is published (with one photo), at
 * `publishedAt` (now unless given); without one it stays a draft.
 */
interface ArticleOptions {
  /** How many photos a published article gets (one by default). */
  images?: number;
  isAvailable?: boolean;
  priceAmount?: number;
  publishedAt?: Date;
}

type CreatedUser = typeof user.$inferSelect;

type StoreInput = typeof store.$inferInsert;

type StoreTextInput = Pick<
  typeof storeTranslation.$inferInsert,
  "description" | "locale" | "tagline"
>;

type CreatedStore = typeof store.$inferSelect;

/** A seeded login and the password it signs in with. */
export interface SeededLogin {
  email: string;
  id: string;
  name: string;
  password: string;
}

const LOGIN_PASSWORD = "synthetic-e2e-login-password-123";

export interface DbFixture {
  db: {
    drizzle: ReturnType<typeof drizzle<typeof schema>>;
    seed: {
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
      /**
       * A category of the store at `position`, named in Spanish (and English
       * when given). Deleted with its store.
       */
      createCategory: (
        storeId: number,
        names: {
          nameEn?: string;
          nameEs: string;
          position: number;
          slug: string;
        }
      ) => Promise<{ id: number; slug: string }>;
      /** A draft article of the store in a category. Deleted with its store. */
      createArticle: (
        storeId: number,
        categoryId: number,
        title: string,
        options?: ArticleOptions
      ) => Promise<{ id: number; slug: string }>;
      /**
       * A filter of the store (FER-033) named in Spanish, with these values
       * in order, each carried by the articles listed. Deleted with its
       * store.
       */
      createFilter: (
        storeId: number,
        filter: {
          nameEs: string;
          slug: string;
          values: {
            articleIds?: number[];
            nameEs: string;
            slug: string;
            swatchColor?: string;
          }[];
        }
      ) => Promise<{ id: number; valueIds: number[] }>;
      /**
       * A login that can sign in through the form (FER-009): its role, a
       * password, and a membership in each store given. Unique per call.
       */
      createLogin: (options: {
        role: "member" | "superadmin";
        storeIds?: number[];
      }) => Promise<SeededLogin>;
    };
  };
}

/**
 * Seeds rows for a test and deletes, at teardown, exactly the rows it seeded,
 * captured as each insert returns. Never by name prefix or `LIKE`: those
 * reach a parallel worker's rows. What a page creates through the UI belongs
 * to a store the spec seeded, and goes with it. Automatic, so a spec that
 * only clicks still cleans up.
 */
export const test = userTest.extend<DbFixture>({
  db: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured first argument
    async ({}, use) => {
      const connectionString = process.env.DATABASE_URL;

      if (!connectionString) {
        throw new Error("DATABASE_URL is required for e2e tests");
      }

      const pool = new Pool({ connectionString, max: 2 });
      const db = drizzle(pool, { schema });
      const seededUserIds: string[] = [];
      const seededStoreIds: number[] = [];

      const seed = {
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

        createCategory: async (
          storeId: number,
          {
            nameEn,
            nameEs,
            position,
            slug,
          }: { nameEn?: string; nameEs: string; position: number; slug: string }
        ): Promise<{ id: number; slug: string }> => {
          const [created] = await db
            .insert(category)
            .values({ position, slug, storeId })
            .returning({ id: category.id, slug: category.slug });

          if (!created) {
            throw new Error("Inserting a category returned no row");
          }

          await db.insert(categoryTranslation).values([
            { categoryId: created.id, locale: "es", name: nameEs },
            ...(nameEn
              ? [
                  {
                    categoryId: created.id,
                    locale: "en" as const,
                    name: nameEn,
                  },
                ]
              : []),
          ]);

          return created;
        },

        createArticle: async (
          storeId: number,
          categoryId: number,
          title: string,
          {
            images = 1,
            isAvailable = true,
            priceAmount,
            publishedAt,
          }: ArticleOptions = {}
        ): Promise<{ id: number; slug: string }> => {
          const published = priceAmount !== undefined;
          const [created] = await db
            .insert(product)
            .values({
              categoryId,
              isAvailable,
              priceAmount: priceAmount ?? null,
              publishedAt: published ? (publishedAt ?? new Date()) : null,
              slug: `e2e-${crypto.randomUUID()}`,
              status: published ? "published" : "draft",
              storeId,
            })
            .returning({ id: product.id, slug: product.slug });

          if (!created) {
            throw new Error("Inserting an article returned no row");
          }

          await db.insert(productTranslation).values({
            description: "",
            locale: "es",
            productId: created.id,
            title,
          });

          if (published && images > 0) {
            const photos = [
              "/seed/ring-1.jpg",
              "/seed/ring-2.jpg",
              "/seed/ring-3.jpg",
            ];
            await db.insert(productImage).values(
              Array.from({ length: images }, (_, position) => ({
                height: 1000,
                position,
                productId: created.id,
                url: photos[position % photos.length] ?? "/seed/ring-1.jpg",
                width: 800,
              }))
            );
          }

          return created;
        },

        createFilter: async (
          storeId: number,
          {
            nameEs,
            slug,
            values,
          }: {
            nameEs: string;
            slug: string;
            values: {
              articleIds?: number[];
              nameEs: string;
              slug: string;
              swatchColor?: string;
            }[];
          }
        ): Promise<{ id: number; valueIds: number[] }> => {
          const [created] = await db
            .insert(attribute)
            .values({ position: 0, slug, storeId })
            .returning({ id: attribute.id });

          if (!created) {
            throw new Error("Inserting a filter returned no row");
          }

          await db
            .insert(attributeTranslation)
            .values({ attributeId: created.id, locale: "es", name: nameEs });
          const valueIds: number[] = [];

          for (const [position, value] of values.entries()) {
            const [row] = await db
              .insert(attributeValue)
              .values({
                attributeId: created.id,
                position,
                slug: value.slug,
                swatchColor: value.swatchColor ?? null,
              })
              .returning({ id: attributeValue.id });

            if (!row) {
              throw new Error("Inserting a filter value returned no row");
            }

            await db.insert(attributeValueTranslation).values({
              attributeValueId: row.id,
              locale: "es",
              name: value.nameEs,
            });

            if (value.articleIds && value.articleIds.length > 0) {
              await db.insert(productAttributeValue).values(
                value.articleIds.map((productId) => ({
                  attributeValueId: row.id,
                  productId,
                }))
              );
            }

            valueIds.push(row.id);
          }

          return { id: created.id, valueIds };
        },

        createLogin: async ({
          role,
          storeIds = [],
        }: {
          role: "member" | "superadmin";
          storeIds?: number[];
        }): Promise<SeededLogin> => {
          const id = crypto.randomUUID();
          const login = {
            email: `e2e-login-${id}@example.com`,
            id,
            name: `E2E ${role} ${id.slice(0, 8)}`,
            password: LOGIN_PASSWORD,
          };
          // Better Auth's own hasher, so the sign-in form accepts it.
          const hash = await hashPassword(login.password);

          await db.insert(user).values({
            email: login.email,
            id,
            name: login.name,
            role,
          });
          seededUserIds.push(id);
          await db.insert(account).values({
            accountId: id,
            id: crypto.randomUUID(),
            password: hash,
            providerId: "credential",
            userId: id,
          });

          if (storeIds.length > 0) {
            await db
              .insert(storeMember)
              .values(storeIds.map((storeId) => ({ storeId, userId: id })));
          }

          return login;
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
        // Cascades to the stores' texts.
        await db.delete(store).where(inArray(store.id, seededStoreIds));
        // Cascades to the users' sessions, accounts and memberships.
        await db.delete(user).where(inArray(user.id, seededUserIds));
        await pool.end();
      }
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
