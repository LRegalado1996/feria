import { randomUUID } from "node:crypto";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createStoreSchema } from "@/lib/schemas/store";
import { db } from "@/server/db";
import {
  category,
  categoryTranslation,
  product,
  productImage,
  productImageTranslation,
  store,
} from "@/server/db/schema";
import { createStore } from "@/server/services/store";

import {
  createProduct,
  deleteProduct,
  getPublishedProduct,
  listCategories,
  listPublishedProducts,
  listRelatedProducts,
  publishProduct,
  reorderProductImages,
  setProductAvailability,
  unpublishProduct,
  updateProduct,
} from "./catalog";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The stores this file created; deleting one cascades to its categories,
// articles, texts and images.
const createdStoreIds: number[] = [];

afterEach(async () => {
  await db.delete(store).where(inArray(store.id, createdStoreIds.splice(0)));
});

async function makeStore() {
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
      isActive: true,
      isDefault: false,
      logoUrl: null,
      name: "Catalog Test",
      slug: `catalog-${randomUUID().slice(0, 8)}`,
      tiktokUrl: null,
      translations: [],
      whatsappNumber: null,
    })
  );
  createdStoreIds.push(row.id);

  return row;
}

async function makeCategory(
  storeId: number,
  slug: string,
  names: { en?: string; es: string },
  position = 0
) {
  const [row] = await db
    .insert(category)
    .values({ position, slug, storeId })
    .returning();

  if (!row) {
    throw new Error("no category");
  }

  await db
    .insert(categoryTranslation)
    .values([
      { categoryId: row.id, locale: "es", name: names.es },
      ...(names.en
        ? [{ categoryId: row.id, locale: "en" as const, name: names.en }]
        : []),
    ]);

  return row;
}

interface ArticleOptions {
  categoryId: number | null;
  description?: string;
  en?: { description: string; title: string };
  images?: number;
  priceAmount?: number | null;
  publish?: boolean;
  title: string;
}

/** An article through the service, with images, published unless told not to. */
async function makeArticle(storeId: number, options: ArticleOptions) {
  const created = await createProduct(db, {
    storeId,
    values: {
      categoryId: options.categoryId,
      isAvailable: true,
      priceAmount:
        options.priceAmount === undefined ? 129_000 : options.priceAmount,
      translations: [
        {
          description: options.description ?? "",
          locale: "es",
          seoDescription: null,
          seoTitle: null,
          title: options.title,
        },
        ...(options.en
          ? [
              {
                description: options.en.description,
                locale: "en" as const,
                seoDescription: null,
                seoTitle: null,
                title: options.en.title,
              },
            ]
          : []),
      ],
    },
  });

  for (let position = 0; position < (options.images ?? 1); position += 1) {
    const [image] = await db
      .insert(productImage)
      .values({
        height: 800,
        position,
        productId: created.id,
        url: `/seed/test-${position}.jpg`,
        width: 800,
      })
      .returning();

    if (image) {
      await db.insert(productImageTranslation).values({
        altText: `${options.title} ${position}`,
        locale: "es",
        productImageId: image.id,
      });
    }
  }

  if (options.publish !== false) {
    await publishProduct(db, { id: created.id, storeId });
  }

  return created;
}

const list = async (
  storeId: number,
  options: Partial<Parameters<typeof listPublishedProducts>[1]> = {}
) =>
  await listPublishedProducts(db, {
    currencyCode: "UYU",
    limit: 24,
    locale: "es",
    storeId,
    ...options,
  });

describe("public catalog", () => {
  test("lists only the store's published articles, never a draft or another store's", async () => {
    const [storeA, storeB] = [await makeStore(), await makeStore()];
    const chains = await makeCategory(storeA.id, "cadenas", { es: "Cadenas" });
    const chainsB = await makeCategory(storeB.id, "cadenas", { es: "Cadenas" });
    const published = await makeArticle(storeA.id, {
      categoryId: chains.id,
      title: "Cadena dorada",
    });
    await makeArticle(storeA.id, {
      categoryId: chains.id,
      publish: false,
      title: "Cadena borrador",
    });
    await makeArticle(storeB.id, {
      categoryId: chainsB.id,
      title: "Cadena de otra tienda",
    });

    const { items } = await list(storeA.id);

    expect(items.map((item) => item.slug)).toEqual([published.slug]);
    expect(items[0]).toMatchObject({
      categorySlug: "cadenas",
      cover: {
        alt: "Cadena dorada 0",
        height: 800,
        url: "/seed/test-0.jpg",
        width: 800,
      },
      currencyCode: "UYU",
      isAvailable: true,
      lang: "es",
      priceAmount: 129_000,
      title: "Cadena dorada",
    });
  });

  test("a draft or another store's article is NOT_FOUND by its slug, a published one is found", async () => {
    const [storeA, storeB] = [await makeStore(), await makeStore()];
    const rings = await makeCategory(storeA.id, "anillos", { es: "Anillos" });
    const published = await makeArticle(storeA.id, {
      categoryId: rings.id,
      title: "Anillo plata",
    });
    const draft = await makeArticle(storeA.id, {
      categoryId: rings.id,
      publish: false,
      title: "Anillo borrador",
    });
    const get = async (storeId: number, slug: string) =>
      await getPublishedProduct(db, {
        currencyCode: "UYU",
        locale: "es",
        slug,
        storeId,
      });

    await expect(get(storeA.id, published.slug)).resolves.toMatchObject({
      category: { name: "Anillos", slug: "anillos" },
      title: "Anillo plata",
    });
    await expect(get(storeA.id, draft.slug)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(get(storeB.id, published.slug)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  test("filters by category slug, and an unknown category lists nothing", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    const rings = await makeCategory(shop.id, "anillos", { es: "Anillos" });
    const chain = await makeArticle(shop.id, {
      categoryId: chains.id,
      title: "Cadena",
    });
    await makeArticle(shop.id, { categoryId: rings.id, title: "Anillo" });

    expect(
      (await list(shop.id, { category: "cadenas" })).items.map((i) => i.slug)
    ).toEqual([chain.slug]);
    expect((await list(shop.id, { category: "nada" })).items).toEqual([]);
  });

  test("search matches title and description in the requested language, Spanish only where English is missing", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", {
      en: "Chains",
      es: "Cadenas",
    });
    const both = await makeArticle(shop.id, {
      categoryId: chains.id,
      description: "Baño de oro de 18k",
      en: { description: "18k gold plated", title: "Golden chain" },
      title: "Cadena dorada",
    });
    const spanishOnly = await makeArticle(shop.id, {
      categoryId: chains.id,
      description: "Plata 925",
      title: "Cadena plateada",
    });
    const search = async (q: string, locale: "en" | "es") =>
      (await list(shop.id, { locale, q })).items.map((item) => item.slug);

    expect(await search("dorada", "es")).toEqual([both.slug]);
    expect(await search("ORO", "es")).toEqual([both.slug]);
    // On an English page the first article shows its English text, so its
    // Spanish words no longer match; the second still shows Spanish.
    expect(await search("dorada", "en")).toEqual([]);
    expect(await search("golden", "en")).toEqual([both.slug]);
    expect(await search("plata", "en")).toEqual([spanishOnly.slug]);
    expect(await search("cadena", "en")).toEqual([spanishOnly.slug]);
    // Accents and case are ignored, as a phone keyboard types.
    expect(await search("ORO DE 18K", "es")).toEqual([both.slug]);
    expect(await search("plateada", "es")).toEqual([spanishOnly.slug]);
    expect(await search("baño", "es")).toEqual([both.slug]);
    expect(await search("bano", "es")).toEqual([both.slug]);
    // `%` and `_` are taken literally.
    expect(await search("%", "es")).toEqual([]);
  });

  test("keyset pages never repeat or skip a row while new articles are published", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    // Newest first, the order the list answers in.
    const first: string[] = [];

    for (let index = 0; index < 5; index += 1) {
      first.unshift(
        (
          await makeArticle(shop.id, {
            categoryId: chains.id,
            title: `Cadena ${index}`,
          })
        ).slug
      );
    }

    const pageOne = await list(shop.id, { limit: 2 });
    // Two more published between the visitor's pages land before the cursor.
    await makeArticle(shop.id, { categoryId: chains.id, title: "Nueva 1" });
    await makeArticle(shop.id, { categoryId: chains.id, title: "Nueva 2" });
    const pageTwo = await list(shop.id, {
      cursor: pageOne.nextCursor ?? undefined,
      limit: 2,
    });
    const pageThree = await list(shop.id, {
      cursor: pageTwo.nextCursor ?? undefined,
      limit: 2,
    });

    const seen = [...pageOne.items, ...pageTwo.items, ...pageThree.items].map(
      (item) => item.slug
    );
    expect(seen).toEqual(first);
    expect(pageThree.nextCursor).toBeNull();
  });

  test("categories come in their order, named in the visitor's language or Spanish", async () => {
    const shop = await makeStore();
    await makeCategory(shop.id, "anillos", { es: "Anillos" }, 1);
    await makeCategory(shop.id, "cadenas", { en: "Chains", es: "Cadenas" }, 0);

    expect(
      await listCategories(db, { locale: "en", storeId: shop.id })
    ).toMatchObject([
      { lang: "en", name: "Chains", slug: "cadenas" },
      { lang: "es", name: "Anillos", slug: "anillos" },
    ]);
  });

  test("related articles share the category, never include the article itself or a draft", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    const rings = await makeCategory(shop.id, "anillos", { es: "Anillos" });
    const main = await makeArticle(shop.id, {
      categoryId: chains.id,
      title: "Cadena A",
    });
    const sibling = await makeArticle(shop.id, {
      categoryId: chains.id,
      title: "Cadena B",
    });
    await makeArticle(shop.id, {
      categoryId: chains.id,
      publish: false,
      title: "Cadena C",
    });
    await makeArticle(shop.id, { categoryId: rings.id, title: "Anillo" });

    const related = await listRelatedProducts(db, {
      categoryId: chains.id,
      currencyCode: "UYU",
      limit: 4,
      locale: "es",
      productId: main.id,
      storeId: shop.id,
    });

    expect(related.map((item) => item.slug)).toEqual([sibling.slug]);
  });
});

describe("store-scoped writes", () => {
  test("slugs come from the Spanish title, stay unique in the store, and stop following it once published", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    const first = await makeArticle(shop.id, {
      categoryId: chains.id,
      publish: false,
      title: "Collar Ñandú",
    });
    const second = await makeArticle(shop.id, {
      categoryId: chains.id,
      publish: false,
      title: "Collar Ñandú",
    });

    expect([first.slug, second.slug]).toEqual([
      "collar-nandu",
      "collar-nandu-2",
    ]);

    const renamedDraft = await updateProduct(db, {
      storeId: shop.id,
      values: {
        categoryId: chains.id,
        id: second.id,
        isAvailable: true,
        priceAmount: 1000,
        translations: [
          {
            description: "",
            locale: "es",
            seoDescription: null,
            seoTitle: null,
            title: "Pulsera",
          },
        ],
      },
    });
    expect(renamedDraft.slug).toBe("pulsera");

    await publishProduct(db, { id: second.id, storeId: shop.id });
    const renamedPublished = await updateProduct(db, {
      storeId: shop.id,
      values: {
        categoryId: chains.id,
        id: second.id,
        isAvailable: true,
        priceAmount: 1000,
        translations: [
          {
            description: "",
            locale: "es",
            seoDescription: null,
            seoTitle: null,
            title: "Otra cosa",
          },
        ],
      },
    });
    expect(renamedPublished.slug).toBe("pulsera");
  });

  test("publishing is refused until it has an image, a category and a price, and says what is missing", async () => {
    const shop = await makeStore();
    const bare = await makeArticle(shop.id, {
      categoryId: null,
      images: 0,
      priceAmount: null,
      publish: false,
      title: "Sin nada",
    });

    await expect(
      publishProduct(db, { id: bare.id, storeId: shop.id })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "The article cannot be published yet. Missing: image, category, price",
    });
  });

  test("the first publication stamps the date once; unpublishing hides it and keeps the date", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    const article = await makeArticle(shop.id, {
      categoryId: chains.id,
      title: "Cadena",
    });
    const dateOf = async () =>
      (await db.query.product.findFirst({ where: eq(product.id, article.id) }))
        ?.publishedAt;
    const firstDate = await dateOf();

    await unpublishProduct(db, { id: article.id, storeId: shop.id });
    expect((await list(shop.id)).items).toEqual([]);

    await publishProduct(db, { id: article.id, storeId: shop.id });
    expect(await dateOf()).toEqual(firstDate);
  });

  test("another store's category cannot be attached, through the service or the database", async () => {
    const [storeA, storeB] = [await makeStore(), await makeStore()];
    const foreign = await makeCategory(storeB.id, "cadenas", { es: "Cadenas" });

    await expect(
      makeArticle(storeA.id, {
        categoryId: foreign.id,
        publish: false,
        title: "X",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Category not found",
    });
    await expect(
      db
        .insert(product)
        .values({ categoryId: foreign.id, slug: "x", storeId: storeA.id })
    ).rejects.toMatchObject({
      cause: { constraint: "product_store_category_fk" },
    });
  });

  test("a category with articles cannot be deleted, and deleting the store takes everything", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    await makeArticle(shop.id, { categoryId: chains.id, title: "Cadena" });

    await expect(
      db.delete(category).where(eq(category.id, chains.id))
    ).rejects.toMatchObject({
      cause: { constraint: "product_store_category_fk" },
    });
    await db.delete(store).where(eq(store.id, shop.id));
    expect(
      await db.query.product.findMany({ where: eq(product.storeId, shop.id) })
    ).toEqual([]);
  });

  test("another store's article is NOT_FOUND for every write", async () => {
    const [storeA, storeB] = [await makeStore(), await makeStore()];
    const chains = await makeCategory(storeA.id, "cadenas", { es: "Cadenas" });
    const article = await makeArticle(storeA.id, {
      categoryId: chains.id,
      title: "Cadena",
    });
    const scope = { id: article.id, storeId: storeB.id };
    const notFound = { code: "NOT_FOUND", message: "Article not found" };

    await expect(publishProduct(db, scope)).rejects.toMatchObject(notFound);
    await expect(unpublishProduct(db, scope)).rejects.toMatchObject(notFound);
    await expect(
      setProductAvailability(db, { ...scope, isAvailable: false })
    ).rejects.toMatchObject(notFound);
    await expect(deleteProduct(db, scope)).rejects.toMatchObject(notFound);
    await expect(
      reorderProductImages(db, { ...scope, imageIds: [1] })
    ).rejects.toMatchObject(notFound);
  });

  test("reorders the images in one go, and refuses a list that is not all of them", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    const article = await makeArticle(shop.id, {
      categoryId: chains.id,
      images: 3,
      title: "Cadena",
    });
    // Last image first: the new order.
    const reversed = (
      await db.query.productImage.findMany({
        orderBy: desc(productImage.position),
        where: eq(productImage.productId, article.id),
      })
    ).map((image) => image.id);

    await reorderProductImages(db, {
      id: article.id,
      imageIds: reversed,
      storeId: shop.id,
    });
    const [cover] = (await list(shop.id)).items;
    expect(cover?.cover?.url).toBe("/seed/test-2.jpg");

    await expect(
      reorderProductImages(db, {
        id: article.id,
        imageIds: reversed.slice(1),
        storeId: shop.id,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Give every image of the article, once each",
    });
  });

  test("an edit that takes a published article's price away is refused", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    const article = await makeArticle(shop.id, {
      categoryId: chains.id,
      title: "Cadena",
    });

    await expect(
      updateProduct(db, {
        storeId: shop.id,
        values: {
          categoryId: chains.id,
          id: article.id,
          isAvailable: true,
          priceAmount: null,
          translations: [
            {
              description: "",
              locale: "es",
              seoDescription: null,
              seoTitle: null,
              title: "Cadena",
            },
          ],
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: price",
    });
  });
});

/** A promise and the function that settles it, for ordering two writers. */
function deferred() {
  let settle: (value: undefined) => void = () => undefined;
  const promise = new Promise<undefined>((resolve) => {
    settle = resolve;
  });

  return { promise, resolve: settle };
}

/** Waits until some query on this database waits on another's lock. */
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

  throw new Error("The second writer never waited on the slug lock");
}

function draftValues(title: string) {
  return {
    categoryId: null,
    isAvailable: true,
    priceAmount: null,
    translations: [
      {
        description: "",
        locale: "es" as const,
        seoDescription: null,
        seoTitle: null,
        title,
      },
    ],
  };
}

describe("slug allocation under two writers", () => {
  test("a second article with the same title waits for the first one's slug and takes the next", async () => {
    const shop = await makeStore();
    const held = deferred();
    const allocated = deferred();

    const first = db.transaction(async (tx) => {
      const created = await createProduct(tx, {
        storeId: shop.id,
        values: draftValues("Collar Gemelo"),
      });
      allocated.resolve(undefined);
      await held.promise;

      return created;
    });
    await allocated.promise;
    const second = db.transaction(
      async (tx) =>
        await createProduct(tx, {
          storeId: shop.id,
          values: draftValues("Collar Gemelo"),
        })
    );

    try {
      await waitUntilBlocked();
    } finally {
      held.resolve(undefined);
      await Promise.allSettled([first, second]);
    }

    const [a, b] = await Promise.all([first, second]);
    expect([a.slug, b.slug]).toEqual(["collar-gemelo", "collar-gemelo-2"]);
  });

  test("control: a store's slug lock never makes another store's creation wait", async () => {
    const [storeA, storeB] = [await makeStore(), await makeStore()];
    const held = deferred();
    const allocated = deferred();

    const first = db.transaction(async (tx) => {
      const created = await createProduct(tx, {
        storeId: storeA.id,
        values: draftValues("Collar"),
      });
      allocated.resolve(undefined);
      await held.promise;

      return created;
    });

    try {
      await allocated.promise;
      // Finishes while store A's transaction still holds its lock: with one
      // lock for every store this would wait for ever.
      const second = await db.transaction(
        async (tx) =>
          await createProduct(tx, {
            storeId: storeB.id,
            values: draftValues("Collar"),
          })
      );
      expect(second.slug).toBe("collar");
    } finally {
      held.resolve(undefined);
    }

    expect((await first).slug).toBe("collar");
  });
});

describe("an edit and a publication of the same article", () => {
  test("the publication waits for the edit's row lock, then refuses the price the edit took away", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    const article = await makeArticle(shop.id, {
      categoryId: chains.id,
      publish: false,
      title: "Cadena",
    });
    const held = deferred();
    const locked = deferred();

    // The edit clears a field publishing needs: only a publication that
    // waited for it (the row lock) reads the cleared price and refuses.
    const edit = db.transaction(async (tx) => {
      const updated = await updateProduct(tx, {
        storeId: shop.id,
        values: {
          categoryId: chains.id,
          id: article.id,
          isAvailable: true,
          priceAmount: null,
          translations: [
            {
              description: "",
              locale: "es",
              seoDescription: null,
              seoTitle: null,
              title: "Cadena",
            },
          ],
        },
      });
      locked.resolve(undefined);
      await held.promise;

      return updated;
    });
    await Promise.race([locked.promise, edit]);
    const publication = publishProduct(db, {
      id: article.id,
      storeId: shop.id,
    });

    try {
      await waitUntilBlocked();
    } finally {
      held.resolve(undefined);
      await Promise.allSettled([edit, publication]);
    }

    await expect(edit).resolves.toMatchObject({ id: article.id });
    await expect(publication).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: price",
    });
  });

  test("control: a publication after the edit committed waits on nothing", async () => {
    const shop = await makeStore();
    const chains = await makeCategory(shop.id, "cadenas", { es: "Cadenas" });
    const article = await makeArticle(shop.id, {
      categoryId: chains.id,
      publish: false,
      title: "Cadena",
    });

    await expect(
      publishProduct(db, { id: article.id, storeId: shop.id })
    ).resolves.toEqual({ id: article.id, slug: "cadena", status: "published" });
  });
});
