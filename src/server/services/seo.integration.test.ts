import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createStoreSchema } from "@/lib/schemas/store";
import { db } from "@/server/db";
import {
  category,
  categoryTranslation,
  productImage,
  store,
} from "@/server/db/schema";
import { createProduct, publishProduct } from "@/server/services/catalog";
import { createStore } from "@/server/services/store";

import {
  listIndexableArticles,
  listIndexableCategories,
  listIndexableStores,
} from "./seo";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Deleting a store cascades to its categories, articles and texts.
const createdStoreIds: number[] = [];

afterEach(async () => {
  await db.delete(store).where(inArray(store.id, createdStoreIds.splice(0)));
});

async function makeStore({ isActive = true } = {}) {
  const row = await createStore(
    db,
    createStoreSchema.parse({
      colorAccent: "#c8f31d",
      colorBackground: "#f2f3f0",
      colorContrast: "#111312",
      colorForeground: "#111312",
      colorSurface: "#ffffff",
      currencyCode: "UYU",
      instagramUrl: null,
      isActive,
      isDefault: false,
      logoUrl: null,
      name: "SEO Test",
      slug: `seo-${randomUUID().slice(0, 8)}`,
      tiktokUrl: null,
      translations: [
        {
          description: "Bijou para todos los días.",
          locale: "es",
          tagline: "Bijou y burbujas",
        },
      ],
      whatsappNumber: null,
    })
  );
  createdStoreIds.push(row.id);

  return row;
}

async function makeCategory(storeId: number, slug: string, name: string) {
  const [row] = await db
    .insert(category)
    .values({ position: 0, slug, storeId })
    .returning();

  if (!row) {
    throw new Error("no category");
  }

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
  const created = await createProduct(db, {
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

  if (publish) {
    // Publishing needs a photo.
    await db.insert(productImage).values({
      height: 800,
      position: 0,
      productId: created.id,
      url: "/seed/test-0.jpg",
      width: 800,
    });
    await publishProduct(db, { id: created.id, storeId });
  }

  return created;
}

describe("what search engines and assistants are told about", () => {
  test("lists an active store with its texts, never an inactive one", async () => {
    const [open, closed] = [
      await makeStore(),
      await makeStore({ isActive: false }),
    ];

    const listed = (await listIndexableStores(db)).filter((row) =>
      [open.id, closed.id].includes(row.id)
    );

    expect(listed).toEqual([
      {
        currencyCode: "UYU",
        id: open.id,
        name: "SEO Test",
        slug: open.slug,
        translations: [
          {
            description: "Bijou para todos los días.",
            locale: "es",
            tagline: "Bijou y burbujas",
          },
        ],
        updatedAt: expect.any(Date),
      },
    ]);
  });

  test("lists a store's published articles only, never a draft", async () => {
    const shop = await makeStore();
    const rings = await makeCategory(shop.id, "anillos", "Anillos");
    const published = await makeArticle(shop.id, rings.id, "Anillo sello");
    await makeArticle(shop.id, rings.id, "Anillo borrador", { publish: false });

    const articles = await listIndexableArticles(db, { storeId: shop.id });

    expect(articles.map((row) => [row.id, row.slug, row.titles])).toEqual([
      [published.id, published.slug, [{ locale: "es", title: "Anillo sello" }]],
    ]);
    expect(articles[0]?.priceAmount).toBe(69_000);
  });

  test("lists nothing of an inactive store, even its published articles", async () => {
    const shop = await makeStore();
    const rings = await makeCategory(shop.id, "anillos", "Anillos");
    await makeArticle(shop.id, rings.id, "Anillo sello");
    await db
      .update(store)
      .set({ isActive: false })
      .where(eq(store.id, shop.id));

    await expect(
      listIndexableArticles(db, { storeId: shop.id })
    ).resolves.toEqual([]);
  });

  test("lists the categories that hold a published article, by name", async () => {
    const shop = await makeStore();
    const rings = await makeCategory(shop.id, "anillos", "Anillos");
    const drafts = await makeCategory(shop.id, "aros", "Aros");
    await makeCategory(shop.id, "pulseras", "Pulseras");
    await makeArticle(shop.id, rings.id, "Anillo sello");
    await makeArticle(shop.id, drafts.id, "Aro borrador", { publish: false });

    await expect(
      listIndexableCategories(db, { locale: "en", storeId: shop.id })
    ).resolves.toEqual([{ name: "Anillos", slug: "anillos" }]);
  });
});
