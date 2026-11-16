import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import {
  category,
  categoryTranslation,
  product,
  productImage,
  store,
  storeTranslation,
} from "@/server/db/schema";
import { createProduct, publishProduct } from "@/server/services/catalog";
import { onlyIds, theStoreId, uniqueTag } from "@/server/test/one-store";

import {
  findIndexableStore,
  listIndexableArticles,
  listIndexableCategories,
} from "./seo";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The store is shared (`theStoreId`): what this file created is deleted by
// id after each test, the articles before their categories.
const created = { categoryIds: [] as number[], productIds: [] as number[] };

const ROLLED_BACK = "Rolled back on purpose: this test keeps nothing";

const SPANISH = {
  description: "Anillos y cadenas.",
  locale: "es",
  tagline: "Joyas en la feria",
} as const;
const ENGLISH = {
  description: "Rings and chains.",
  locale: "en",
  tagline: "Jewelry at the fair",
} as const;

afterEach(async () => {
  await db
    .delete(product)
    .where(inArray(product.id, created.productIds.splice(0)));
  await db
    .delete(category)
    .where(inArray(category.id, created.categoryIds.splice(0)));
});

async function makeCategory(storeId: number, slug: string, name: string) {
  const [row] = await db
    .insert(category)
    .values({ position: 0, slug, storeId })
    .returning();

  if (!row) {
    throw new Error("no category");
  }

  created.categoryIds.push(row.id);
  await db
    .insert(categoryTranslation)
    .values({ categoryId: row.id, locale: "es", name });

  return row;
}

/** An article through the service, published unless told not to. */
async function makeArticle(
  storeId: number,
  categoryId: number,
  title: string,
  { publish = true } = {}
) {
  const row = await createProduct(db, {
    storeId,
    values: {
      categoryId,
      isAvailable: true,
      priceAmount: 69_000,
      translations: [
        {
          description: "",
          locale: "es",
          seoDescription: null,
          seoTitle: null,
          title,
        },
      ],
    },
  });
  created.productIds.push(row.id);

  if (publish) {
    // Publishing needs a photo.
    await db.insert(productImage).values({
      height: 800,
      position: 0,
      productId: row.id,
      url: "/seed/test-0.jpg",
      width: 800,
    });
    await publishProduct(db, { id: row.id, storeId });
  }

  return row;
}

/**
 * "Anillos" holding a published article and a draft, "Aros" holding only a
 * draft and "Pulseras" empty, all under one tag.
 */
async function setup() {
  const storeId = await theStoreId(db);
  const tag = uniqueTag();
  const rings = await makeCategory(storeId, `anillos-${tag}`, `Anillos ${tag}`);
  const earrings = await makeCategory(storeId, `aros-${tag}`, `Aros ${tag}`);
  const bracelets = await makeCategory(
    storeId,
    `pulseras-${tag}`,
    `Pulseras ${tag}`
  );
  const published = await makeArticle(storeId, rings.id, `Anillo sello ${tag}`);
  const drafts = [
    await makeArticle(storeId, rings.id, `Anillo borrador ${tag}`, {
      publish: false,
    }),
    await makeArticle(storeId, earrings.id, `Aro borrador ${tag}`, {
      publish: false,
    }),
  ];

  return {
    categories: [rings, earrings, bracelets],
    drafts,
    published,
    rings,
    storeId,
    tag,
  };
}

describe("what search engines and assistants are told about", () => {
  // The store's texts are every file's: a migrated database has none, so
  // the test writes its own, inside a transaction it then rolls back.
  test("reads the store's own row with its texts, the columns the sitemap and llms.txt use", async () => {
    const run = db.transaction(async (tx) => {
      const storeId = await theStoreId(tx);
      await tx
        .delete(storeTranslation)
        .where(eq(storeTranslation.storeId, storeId));
      await tx.insert(storeTranslation).values([
        { ...SPANISH, storeId },
        { ...ENGLISH, storeId },
      ]);
      const [row] = await tx
        .select({
          currencyCode: store.currencyCode,
          id: store.id,
          name: store.name,
          updatedAt: store.updatedAt,
        })
        .from(store)
        .where(eq(store.id, storeId));

      const found = await findIndexableStore(tx);

      expect(found).toEqual({ ...row, translations: expect.any(Array) });
      // Whatever order the read gave them: both texts, and only them.
      expect(new Set(found?.translations)).toEqual(new Set([SPANISH, ENGLISH]));

      throw new Error(ROLLED_BACK);
    });

    // A failed expectation above rejects with its own message instead.
    await expect(run).rejects.toThrow(ROLLED_BACK);
  });

  test("lists the store's published articles only, never a draft", async () => {
    const { drafts, published, storeId, tag } = await setup();

    const articles = onlyIds(await listIndexableArticles(db, { storeId }), [
      published.id,
      ...drafts.map((draft) => draft.id),
    ]);

    expect(articles.map((row) => [row.id, row.slug, row.titles])).toEqual([
      [
        published.id,
        published.slug,
        [{ locale: "es", title: `Anillo sello ${tag}` }],
      ],
    ]);
    expect(articles[0]?.priceAmount).toBe(69_000);
  });

  test("lists the categories that hold a published article, by name, never one with only drafts or none", async () => {
    const { categories, rings, storeId, tag } = await setup();
    const ownSlugs = new Set(categories.map((row) => row.slug));

    expect(
      (await listIndexableCategories(db, { locale: "en", storeId })).filter(
        (row) => ownSlugs.has(row.slug)
      )
    ).toEqual([{ name: `Anillos ${tag}`, slug: rings.slug }]);
  });
});
