import { hashPassword } from "better-auth/crypto";
import { eq, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../server/db/schema";
import {
  account,
  attribute,
  attributeTranslation,
  attributeValue,
  attributeValueTranslation,
  banner,
  bannerTranslation,
  category,
  categoryTranslation,
  customerOrder,
  orderItem,
  pageCoverBanner,
  pageSection,
  product,
  productAttributeValue,
  productImage,
  productTranslation,
  store,
  user,
} from "../../server/db/schema";
import { test as userTest } from "./user.fixture";

/**
 * An article of the store in a category. With a price it is published (with
 * one photo), at `publishedAt` (now unless given); without one it stays a
 * draft.
 */
interface ArticleOptions {
  categoryId: number;
  /** Searched like the title: a test's own word scopes the catalog to it. */
  description?: string;
  /** How many photos a published article gets (one by default). */
  images?: number;
  isAvailable?: boolean;
  priceAmount?: number;
  publishedAt?: Date;
  title: string;
}

/** A photo of `public/seed/` with its size, as the database keeps one. */
interface SeedImage {
  height: number;
  url: string;
  width: number;
}

/**
 * A banner of the home (FER-020), on and with no days: in the cover or
 * between rows. Its photos are the seed's, which `next/image` serves
 * without the Blob store.
 */
interface BannerOptions {
  /** Its button's own words in Spanish; none for "Comprar ahora". */
  ctaEs?: string;
  image: SeedImage;
  /** Where it leads: a category's page or a site path; nowhere without. */
  link?: { categoryId: number } | { url: string };
  phoneImage?: SeedImage;
  placement: "cover" | "rows";
  titleEn?: string;
  titleEs: string;
}

interface FilterOptions {
  nameEs: string;
  slug: string;
  /** In this order, each carried by the articles listed. */
  values: {
    articleIds?: number[];
    nameEs: string;
    slug: string;
    swatchColor?: string;
  }[];
}

/** A seeded login and the password it signs in with. */
export interface SeededLogin {
  email: string;
  id: string;
  name: string;
  password: string;
}

const LOGIN_PASSWORD = "synthetic-e2e-login-password-123";

const PHOTOS = ["/seed/ring-1.jpg", "/seed/ring-2.jpg", "/seed/ring-3.jpg"];

export interface DbFixture {
  db: {
    drizzle: ReturnType<typeof drizzle<typeof schema>>;
    seed: {
      /**
       * A draft or published article of the store (`ArticleOptions`), at an
       * address no other test has.
       */
      createArticle: (options: ArticleOptions) => Promise<{
        id: number;
        slug: string;
      }>;
      /**
       * A banner on the home page (`BannerOptions`). In the cover it goes
       * last until the home's order is saved; between rows, after the rest.
       * Only a `*.serial.e2e.ts` spec may add one: every store page's home
       * would show it.
       */
      createBanner: (options: BannerOptions) => Promise<{ id: number }>;
      /**
       * A category of the store at the end of its list, named in Spanish
       * (and English when given). The name and slug carry the test's own tag.
       */
      createCategory: (names: {
        /** A computer image from `public/seed/` for its page (FER-043). */
        cover?: { height: number; url: string; width: number };
        nameEn?: string;
        nameEs: string;
        /** The group it is in (FER-043). */
        parentId?: number;
        slug: string;
      }) => Promise<{ id: number; slug: string }>;
      /**
       * A filter of the store (FER-033) at the end of its list, named in
       * Spanish, with its values in order.
       */
      createFilter: (
        filter: FilterOptions
      ) => Promise<{ id: number; valueIds: number[] }>;
      /**
       * A login that can sign in through the form (FER-009). Every login is
       * an admin and reaches the whole admin (FER-038). Unique per call.
       */
      createLogin: () => Promise<SeededLogin>;
    };
    /** The id of the store, the table's one row, which every spec shares. */
    storeId: number;
  };
}

/**
 * Seeds rows for a test in the one store every spec shares (FER-038) and
 * deletes, at teardown, exactly the rows the test created: the ones seeded
 * here, captured as each insert returns, and the ones its pages created
 * through the UI (`createdRows`). Never by name prefix or `LIKE`, which
 * reach a parallel worker's rows, and never the store. Automatic, so a spec
 * that only clicks still cleans up.
 */
export const test = userTest.extend<DbFixture>({
  db: [
    async ({ createdRows }, use) => {
      const connectionString = process.env.DATABASE_URL;

      if (!connectionString) {
        throw new Error("DATABASE_URL is required for e2e tests");
      }

      const pool = new Pool({ connectionString, max: 2 });
      const db = drizzle(pool, { schema });
      const seeded: {
        articleIds: number[];
        bannerIds: number[];
        categoryIds: number[];
        filterIds: number[];
        userIds: string[];
      } = {
        articleIds: [],
        bannerIds: [],
        categoryIds: [],
        filterIds: [],
        userIds: [],
      };

      try {
        const [theStore] = await db
          .select({ id: store.id })
          .from(store)
          .limit(1);

        if (!theStore) {
          throw new Error(
            "The e2e database has no store: run its migrations (0012 creates it)"
          );
        }

        const storeId = theStore.id;

        const seed: DbFixture["db"]["seed"] = {
          createCategory: async ({ cover, nameEn, nameEs, parentId, slug }) => {
            const [created] = await db
              .insert(category)
              .values({
                coverHeight: cover?.height,
                coverUrl: cover?.url,
                coverWidth: cover?.width,
                parentId,
                // After every category of the store, as the admin adds one.
                position: sql`(select coalesce(max(${category.position}), -1) + 1 from ${category} where ${category.storeId} = ${storeId})`,
                slug,
                storeId,
              })
              .returning({ id: category.id, slug: category.slug });

            if (!created) {
              throw new Error("Inserting a category returned no row");
            }

            seeded.categoryIds.push(created.id);
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

          createArticle: async ({
            categoryId,
            description = "",
            images = 1,
            isAvailable = true,
            priceAmount,
            publishedAt,
            title,
          }) => {
            const published = priceAmount !== undefined;
            const [created] = await db
              .insert(product)
              .values({
                categoryId,
                isAvailable,
                priceAmount: priceAmount ?? null,
                publishedAt: published ? (publishedAt ?? new Date()) : null,
                // Never seen before, so no cached page or cached 404 exists
                // for it.
                slug: `e2e-${crypto.randomUUID()}`,
                status: published ? "published" : "draft",
                storeId,
              })
              .returning({ id: product.id, slug: product.slug });

            if (!created) {
              throw new Error("Inserting an article returned no row");
            }

            seeded.articleIds.push(created.id);
            await db.insert(productTranslation).values({
              description,
              locale: "es",
              productId: created.id,
              title,
            });

            if (published && images > 0) {
              await db.insert(productImage).values(
                Array.from({ length: images }, (_, position) => ({
                  height: 1000,
                  position,
                  productId: created.id,
                  url: PHOTOS[position % PHOTOS.length] ?? "/seed/ring-1.jpg",
                  width: 800,
                }))
              );
            }

            return created;
          },

          createBanner: async ({
            ctaEs,
            image,
            link,
            phoneImage,
            placement,
            titleEn,
            titleEs,
          }) => {
            const [created] = await db
              .insert(banner)
              .values({
                imageHeight: image.height,
                imagePhoneHeight: phoneImage?.height,
                imagePhoneUrl: phoneImage?.url,
                imagePhoneWidth: phoneImage?.width,
                imageUrl: image.url,
                imageWidth: image.width,
                isActive: true,
                linkCategoryId:
                  link && "categoryId" in link ? link.categoryId : null,
                linkUrl: link && "url" in link ? link.url : null,
                storeId,
              })
              .returning({ id: banner.id });

            if (!created) {
              throw new Error("Inserting a banner returned no row");
            }

            // Placed last on the home page (FER-058) until its order is
            // saved: last of the cover, or after the rest of its blocks.
            const [own] = await db
              .select({ homePageId: store.homePageId })
              .from(store)
              .where(eq(store.id, storeId));

            if (!own) {
              throw new Error("The store has no row");
            }

            await (placement === "cover"
              ? db.insert(pageCoverBanner).values({
                  bannerId: created.id,
                  pageId: own.homePageId,
                  position: sql`(select coalesce(max(${pageCoverBanner.position}), -1) + 1 from ${pageCoverBanner} where ${pageCoverBanner.pageId} = ${own.homePageId})`,
                })
              : db.insert(pageSection).values({
                  bannerId: created.id,
                  kind: "banner",
                  pageId: own.homePageId,
                  position: sql`(select coalesce(max(${pageSection.position}), -1) + 1 from ${pageSection} where ${pageSection.pageId} = ${own.homePageId})`,
                  storeId,
                }));

            seeded.bannerIds.push(created.id);
            await db.insert(bannerTranslation).values([
              {
                bannerId: created.id,
                ctaLabel: ctaEs ?? null,
                locale: "es",
                title: titleEs,
              },
              ...(titleEn
                ? [
                    {
                      bannerId: created.id,
                      locale: "en" as const,
                      title: titleEn,
                    },
                  ]
                : []),
            ]);

            return created;
          },

          createFilter: async ({ nameEs, slug, values }) => {
            const [created] = await db
              .insert(attribute)
              .values({
                position: sql`(select coalesce(max(${attribute.position}), -1) + 1 from ${attribute} where ${attribute.storeId} = ${storeId})`,
                slug,
                storeId,
              })
              .returning({ id: attribute.id });

            if (!created) {
              throw new Error("Inserting a filter returned no row");
            }

            seeded.filterIds.push(created.id);
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

          createLogin: async () => {
            const id = crypto.randomUUID();
            const login = {
              email: `e2e-login-${id}@example.com`,
              id,
              name: `E2E Admin ${id}`,
              password: LOGIN_PASSWORD,
            };
            // Better Auth's own hasher, so the sign-in form accepts it.
            const hash = await hashPassword(login.password);

            await db
              .insert(user)
              .values({ email: login.email, id, name: login.name });
            seeded.userIds.push(id);
            await db.insert(account).values({
              accountId: id,
              id: crypto.randomUUID(),
              password: hash,
              providerId: "credential",
              userId: id,
            });

            return login;
          },
        };

        await use({ drizzle: db, seed, storeId });
      } finally {
        try {
          // A response still being read when the test ended still counts.
          await Promise.all(createdRows.pending);
          await deleteCreated(db, {
            ...seeded,
            articleIds: [...seeded.articleIds, ...createdRows.articleIds],
            categoryIds: [...seeded.categoryIds, ...createdRows.categoryIds],
            filterIds: [...seeded.filterIds, ...createdRows.filterIds],
            filterValueIds: createdRows.filterValueIds,
            orderTokens: createdRows.orderTokens,
          });
        } finally {
          await pool.end();
        }
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

/**
 * Deletes a test's rows, in the order their references allow. The orders
 * first: an order line's article is set to null when the article goes, and
 * nothing would lead to the order after that. Then the home's banners (with
 * their texts and places), then the articles, which hold
 * their category (`product_store_category_fk` refuses a category with
 * articles), the filters with their values, the categories, and the logins
 * with their sessions and accounts. An order's lines and status history go
 * with it, an article's texts, photos and filter values with it.
 */
async function deleteCreated(
  db: ReturnType<typeof drizzle<typeof schema>>,
  rows: {
    articleIds: number[];
    bannerIds: number[];
    categoryIds: number[];
    filterIds: number[];
    filterValueIds: number[];
    orderTokens: string[];
    userIds: string[];
  }
): Promise<void> {
  const orderIds =
    rows.articleIds.length === 0
      ? []
      : await db
          .selectDistinct({ id: orderItem.orderId })
          .from(orderItem)
          .where(inArray(orderItem.productId, rows.articleIds));

  await db.delete(customerOrder).where(
    or(
      inArray(
        customerOrder.id,
        orderIds.map((order) => order.id)
      ),
      inArray(customerOrder.token, rows.orderTokens)
    )
  );
  // Before their articles and categories, which a banner may lead to.
  await db.delete(banner).where(inArray(banner.id, rows.bannerIds));
  await db.delete(product).where(inArray(product.id, rows.articleIds));
  await db
    .delete(attributeValue)
    .where(inArray(attributeValue.id, rows.filterValueIds));
  await db.delete(attribute).where(inArray(attribute.id, rows.filterIds));
  await db.delete(category).where(inArray(category.id, rows.categoryIds));
  await db.delete(user).where(inArray(user.id, rows.userIds));
}

/** The test's orders: the ones holding one of `articleIds`, newest last. */
export async function ordersHolding(
  db: ReturnType<typeof drizzle<typeof schema>>,
  articleIds: number[]
) {
  return await db
    .selectDistinct({
      code: customerOrder.code,
      id: customerOrder.id,
      token: customerOrder.token,
    })
    .from(customerOrder)
    .innerJoin(orderItem, eq(orderItem.orderId, customerOrder.id))
    .where(inArray(orderItem.productId, articleIds))
    .orderBy(customerOrder.id);
}

export { expect } from "@playwright/test";
