import { desc, eq, inArray, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import {
  category,
  categoryTranslation,
  product,
  productImage,
  productImageTranslation,
} from "@/server/db/schema";
import { onlyIds, theStoreId, uniqueTag } from "@/server/test/one-store";

import {
  createProduct,
  deleteProduct,
  getPublishedProduct,
  listCartProducts,
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

// The store is shared (`theStoreId`): a test lists through a category of its
// own, or by ids it holds, and what it created is deleted by id after it,
// the articles first (their texts and images go with them), since a category
// that still has one cannot be deleted.
const created = { categoryIds: [] as number[], productIds: [] as number[] };

afterEach(async () => {
  await db
    .delete(product)
    .where(inArray(product.id, created.productIds.splice(0)));
  await db
    .delete(category)
    .where(inArray(category.id, created.categoryIds.splice(0)));
});

/** A category of the store at `slug-<tag>`, named in Spanish and maybe English. */
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

  created.categoryIds.push(row.id);
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
  const row = await createProduct(db, {
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
  created.productIds.push(row.id);

  for (let position = 0; position < (options.images ?? 1); position += 1) {
    const [image] = await db
      .insert(productImage)
      .values({
        height: 800,
        position,
        productId: row.id,
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
    await publishProduct(db, { id: row.id, storeId });
  }

  return row;
}

/** The store's id, a tag for this test's names, and its own category. */
async function setup() {
  const storeId = await theStoreId(db);
  const tag = uniqueTag();
  const chains = await makeCategory(storeId, `cadenas-${tag}`, {
    en: "Chains",
    es: `Cadenas ${tag}`,
  });

  return { chains, storeId, tag };
}

/** The store's published list through one category, a test's own. */
const list = async (
  storeId: number,
  options: Partial<Parameters<typeof listPublishedProducts>[1]> & {
    category: string;
  }
) =>
  await listPublishedProducts(db, {
    currencyCode: "UYU",
    limit: 24,
    locale: "es",
    storeId,
    ...options,
  });

describe("public catalog", () => {
  test("lists only the store's published articles, never a draft", async () => {
    const { chains, storeId, tag } = await setup();
    const published = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena dorada ${tag}`,
    });
    await makeArticle(storeId, {
      categoryId: chains.id,
      publish: false,
      title: `Cadena borrador ${tag}`,
    });

    const { items } = await list(storeId, { category: chains.slug });

    expect(items.map((item) => item.slug)).toEqual([published.slug]);
    expect(items[0]).toMatchObject({
      categorySlug: chains.slug,
      cover: {
        alt: `Cadena dorada ${tag} 0`,
        height: 800,
        url: "/seed/test-0.jpg",
        width: 800,
      },
      currencyCode: "UYU",
      isAvailable: true,
      lang: "es",
      priceAmount: 129_000,
      title: `Cadena dorada ${tag}`,
    });
  });

  test("a draft or a deleted article is NOT_FOUND by its slug, a published one is found", async () => {
    const { storeId, tag } = await setup();
    const rings = await makeCategory(storeId, `anillos-${tag}`, {
      es: `Anillos ${tag}`,
    });
    const published = await makeArticle(storeId, {
      categoryId: rings.id,
      title: `Anillo plata ${tag}`,
    });
    const draft = await makeArticle(storeId, {
      categoryId: rings.id,
      publish: false,
      title: `Anillo borrador ${tag}`,
    });
    const deleted = await makeArticle(storeId, {
      categoryId: rings.id,
      title: `Anillo borrado ${tag}`,
    });
    await deleteProduct(db, { id: deleted.id, storeId });
    const get = async (slug: string) =>
      await getPublishedProduct(db, {
        currencyCode: "UYU",
        locale: "es",
        slug,
        storeId,
      });

    await expect(get(published.slug)).resolves.toMatchObject({
      category: { name: `Anillos ${tag}`, slug: rings.slug },
      title: `Anillo plata ${tag}`,
    });
    const notFound = { code: "NOT_FOUND", message: "Article not found" };

    await expect(get(draft.slug)).rejects.toMatchObject(notFound);
    await expect(get(deleted.slug)).rejects.toMatchObject(notFound);
  });

  test("filters by category slug, and an unknown category lists nothing", async () => {
    const { chains, storeId, tag } = await setup();
    const rings = await makeCategory(storeId, `anillos-${tag}`, {
      es: `Anillos ${tag}`,
    });
    const chain = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena ${tag}`,
    });
    await makeArticle(storeId, {
      categoryId: rings.id,
      title: `Anillo ${tag}`,
    });

    expect(
      (await list(storeId, { category: chains.slug })).items.map((i) => i.slug)
    ).toEqual([chain.slug]);
    expect((await list(storeId, { category: `nada-${tag}` })).items).toEqual(
      []
    );
  });

  test("search matches title and description in the requested language, Spanish only where English is missing", async () => {
    const { chains, storeId } = await setup();
    const both = await makeArticle(storeId, {
      categoryId: chains.id,
      description: "Baño de oro de 18k",
      en: { description: "18k gold plated", title: "Golden chain" },
      title: "Cadena dorada",
    });
    const spanishOnly = await makeArticle(storeId, {
      categoryId: chains.id,
      description: "Plata 925",
      title: "Cadena plateada",
    });
    const search = async (q: string, locale: "en" | "es") =>
      (await list(storeId, { category: chains.slug, locale, q })).items.map(
        (item) => item.slug
      );

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
    const { chains, storeId, tag } = await setup();
    // Newest first, the order the list answers in.
    const first: string[] = [];

    for (let index = 0; index < 5; index += 1) {
      first.unshift(
        (
          await makeArticle(storeId, {
            categoryId: chains.id,
            title: `Cadena ${index} ${tag}`,
          })
        ).slug
      );
    }

    const pageOne = await list(storeId, { category: chains.slug, limit: 2 });
    // Two more published between the visitor's pages land before the cursor.
    await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Nueva 1 ${tag}`,
    });
    await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Nueva 2 ${tag}`,
    });
    const pageTwo = await list(storeId, {
      category: chains.slug,
      cursor: pageOne.nextCursor ?? undefined,
      limit: 2,
    });
    const pageThree = await list(storeId, {
      category: chains.slug,
      cursor: pageTwo.nextCursor ?? undefined,
      limit: 2,
    });

    const seen = [...pageOne.items, ...pageTwo.items, ...pageThree.items].map(
      (item) => item.slug
    );
    expect(seen).toEqual(first);
    expect(pageThree.nextCursor).toBeNull();
  });

  test.each([
    ["price_asc", ["Barato", "Medio A", "Medio B", "Caro"]],
    ["price_desc", ["Caro", "Medio B", "Medio A", "Barato"]],
  ] as const)(
    "sorts by %s across pages, a tie in price broken by id, never repeating a row",
    async (sort, titles) => {
      const { chains, storeId, tag } = await setup();
      const slugOf = new Map<string, string>();
      const idOf = new Map<string, number>();

      for (const [title, priceAmount] of [
        ["Medio A", 500],
        ["Caro", 900],
        ["Barato", 100],
        ["Medio B", 500],
      ] as const) {
        const row = await makeArticle(storeId, {
          categoryId: chains.id,
          priceAmount,
          title: `${title} ${tag}`,
        });
        slugOf.set(title, row.slug);
        idOf.set(title, row.id);
      }

      const pageOne = await list(storeId, {
        category: chains.slug,
        limit: 2,
        sort,
      });
      const pageTwo = await list(storeId, {
        category: chains.slug,
        cursor: pageOne.nextCursor ?? undefined,
        limit: 2,
        sort,
      });

      expect(
        [...pageOne.items, ...pageTwo.items].map((item) => item.slug)
      ).toEqual(titles.map((title) => slugOf.get(title)));
      // Page one ends on the second title, priced 500 in either order.
      expect(pageOne.nextCursor).toEqual({
        id: idOf.get(titles[1]),
        priceAmount: 500,
        sort,
      });
      expect(pageTwo.nextCursor).toBeNull();
    }
  );

  test("a cursor from another sort is refused, never read as this one's", async () => {
    const { chains, storeId, tag } = await setup();
    await makeArticle(storeId, { categoryId: chains.id, title: `Uno ${tag}` });
    await makeArticle(storeId, { categoryId: chains.id, title: `Dos ${tag}` });
    const newest = await list(storeId, { category: chains.slug, limit: 1 });

    await expect(
      list(storeId, {
        category: chains.slug,
        cursor: newest.nextCursor ?? undefined,
        limit: 1,
        sort: "price_asc",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That cursor belongs to another sort",
    });
  });

  test("a price_asc cursor is refused by price_desc, though both carry a price", async () => {
    const { chains, storeId, tag } = await setup();
    await makeArticle(storeId, {
      categoryId: chains.id,
      priceAmount: 100,
      title: `Barato ${tag}`,
    });
    await makeArticle(storeId, {
      categoryId: chains.id,
      priceAmount: 900,
      title: `Caro ${tag}`,
    });
    const ascending = await list(storeId, {
      category: chains.slug,
      limit: 1,
      sort: "price_asc",
    });

    await expect(
      list(storeId, {
        category: chains.slug,
        cursor: ascending.nextCursor ?? undefined,
        limit: 1,
        sort: "price_desc",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That cursor belongs to another sort",
    });
  });

  test("categories come in their order, named in the visitor's language or Spanish", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const rings = await makeCategory(
      storeId,
      `anillos-${tag}`,
      { es: `Anillos ${tag}` },
      1
    );
    const chains = await makeCategory(
      storeId,
      `cadenas-${tag}`,
      { en: "Chains", es: `Cadenas ${tag}` },
      0
    );

    expect(
      onlyIds(await listCategories(db, { locale: "en", storeId }), [
        chains.id,
        rings.id,
      ])
    ).toMatchObject([
      { lang: "en", name: "Chains", slug: chains.slug },
      { lang: "es", name: `Anillos ${tag}`, slug: rings.slug },
    ]);
  });

  test("related articles share the category, never include the article itself or a draft", async () => {
    const { chains, storeId, tag } = await setup();
    const rings = await makeCategory(storeId, `anillos-${tag}`, {
      es: `Anillos ${tag}`,
    });
    const main = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena A ${tag}`,
    });
    const sibling = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena B ${tag}`,
    });
    await makeArticle(storeId, {
      categoryId: chains.id,
      publish: false,
      title: `Cadena C ${tag}`,
    });
    await makeArticle(storeId, {
      categoryId: rings.id,
      title: `Anillo ${tag}`,
    });

    const related = await listRelatedProducts(db, {
      categoryId: chains.id,
      currencyCode: "UYU",
      limit: 4,
      locale: "es",
      productId: main.id,
      storeId,
    });

    expect(related.map((item) => item.slug)).toEqual([sibling.slug]);
  });
});

describe("cart products", () => {
  test.each(["newer", "older"] as const)(
    "answers the store's published articles in the order the cart asked (the %s first), leaving out a draft and a deleted one",
    async (lead) => {
      const { chains, storeId, tag } = await setup();
      const first = await makeArticle(storeId, {
        categoryId: chains.id,
        priceAmount: 129_000,
        title: `Cadena primera ${tag}`,
      });
      const second = await makeArticle(storeId, {
        categoryId: chains.id,
        priceAmount: 54_000,
        title: `Cadena segunda ${tag}`,
      });
      const draft = await makeArticle(storeId, {
        categoryId: chains.id,
        publish: false,
        title: `Cadena borrador ${tag}`,
      });
      const deleted = await makeArticle(storeId, {
        categoryId: chains.id,
        title: `Cadena borrada ${tag}`,
      });
      await deleteProduct(db, { id: deleted.id, storeId });

      const firstRow = {
        currencyCode: "UYU",
        id: first.id,
        isAvailable: true,
        priceAmount: 129_000,
        title: `Cadena primera ${tag}`,
      };
      const secondRow = {
        currencyCode: "UYU",
        id: second.id,
        isAvailable: true,
        priceAmount: 54_000,
        title: `Cadena segunda ${tag}`,
      };
      // Both orders: the cart's order, so an implementation sorting newest
      // first, or by id, fails one of them.
      const [askedFirst, askedLast, expected] =
        lead === "newer"
          ? [second, first, [secondRow, firstRow]]
          : [first, second, [firstRow, secondRow]];

      const items = await listCartProducts(db, {
        currencyCode: "UYU",
        ids: [askedFirst.id, draft.id, deleted.id, askedLast.id],
        locale: "es",
        storeId,
      });

      expect(
        items.map(({ currencyCode, id, isAvailable, priceAmount, title }) => ({
          currencyCode,
          id,
          isAvailable,
          priceAmount,
          title,
        }))
      ).toEqual(expected);
    }
  );

  test("a sold-out article comes back, marked as not available", async () => {
    const { chains, storeId, tag } = await setup();
    const soldOut = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena agotada ${tag}`,
    });
    await setProductAvailability(db, {
      id: soldOut.id,
      isAvailable: false,
      storeId,
    });

    const items = await listCartProducts(db, {
      currencyCode: "UYU",
      ids: [soldOut.id],
      locale: "es",
      storeId,
    });

    expect(items.map(({ id, isAvailable }) => ({ id, isAvailable }))).toEqual([
      { id: soldOut.id, isAvailable: false },
    ]);
  });
});

describe("store-scoped writes", () => {
  test("slugs come from the Spanish title, stay unique in the store, and stop following it once published", async () => {
    const { chains, storeId, tag } = await setup();
    const first = await makeArticle(storeId, {
      categoryId: chains.id,
      publish: false,
      title: `Collar Ñandú ${tag}`,
    });
    const second = await makeArticle(storeId, {
      categoryId: chains.id,
      publish: false,
      title: `Collar Ñandú ${tag}`,
    });

    expect([first.slug, second.slug]).toEqual([
      `collar-nandu-${tag}`,
      `collar-nandu-${tag}-2`,
    ]);

    const rename = async (title: string) =>
      await updateProduct(db, {
        storeId,
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
              title,
            },
          ],
        },
      });

    expect((await rename(`Pulsera ${tag}`)).slug).toBe(`pulsera-${tag}`);

    await publishProduct(db, { id: second.id, storeId });
    expect((await rename(`Otra cosa ${tag}`)).slug).toBe(`pulsera-${tag}`);
  });

  test("publishing is refused until it has an image, a category and a price, and says what is missing", async () => {
    const storeId = await theStoreId(db);
    const bare = await makeArticle(storeId, {
      categoryId: null,
      images: 0,
      priceAmount: null,
      publish: false,
      title: `Sin nada ${uniqueTag()}`,
    });

    await expect(
      publishProduct(db, { id: bare.id, storeId })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "The article cannot be published yet. Missing: image, category, price",
    });
  });

  test("the first publication stamps the date once; unpublishing hides it and keeps the date", async () => {
    const { chains, storeId, tag } = await setup();
    const article = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena ${tag}`,
    });
    const dateOf = async () =>
      (await db.query.product.findFirst({ where: eq(product.id, article.id) }))
        ?.publishedAt;
    const firstDate = await dateOf();

    await unpublishProduct(db, { id: article.id, storeId });
    expect((await list(storeId, { category: chains.slug })).items).toEqual([]);

    await publishProduct(db, { id: article.id, storeId });
    expect(await dateOf()).toEqual(firstDate);
  });

  test("a category the store no longer has cannot be attached, through the service or the database", async () => {
    const { storeId, tag } = await setup();
    const gone = await makeCategory(storeId, `viejas-${tag}`, {
      es: `Viejas ${tag}`,
    });
    await db.delete(category).where(eq(category.id, gone.id));

    await expect(
      makeArticle(storeId, {
        categoryId: gone.id,
        publish: false,
        title: `X ${tag}`,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Category not found",
    });
    await expect(
      db
        .insert(product)
        .values({ categoryId: gone.id, slug: `x-${tag}`, storeId })
    ).rejects.toMatchObject({
      cause: { constraint: "product_store_category_fk" },
    });
  });

  test("a category with articles cannot be deleted", async () => {
    const { chains, storeId, tag } = await setup();
    await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena ${tag}`,
    });

    await expect(
      db.delete(category).where(eq(category.id, chains.id))
    ).rejects.toMatchObject({
      cause: { constraint: "product_store_category_fk" },
    });
  });

  test("deleting an article answers its images' addresses and leaves no image row", async () => {
    const { chains, storeId, tag } = await setup();
    const article = await makeArticle(storeId, {
      categoryId: chains.id,
      images: 2,
      title: `Cadena ${tag}`,
    });

    const deleted = await deleteProduct(db, { id: article.id, storeId });

    expect(deleted.id).toBe(article.id);
    // In no order: the article's images are read only to delete their files.
    expect(new Set(deleted.imageUrls)).toEqual(
      new Set(["/seed/test-0.jpg", "/seed/test-1.jpg"])
    );
    expect(deleted.imageUrls).toHaveLength(2);
    await expect(
      db
        .select({ id: productImage.id })
        .from(productImage)
        .where(eq(productImage.productId, article.id))
    ).resolves.toEqual([]);
  });

  test("an article the store no longer has is NOT_FOUND for every write", async () => {
    const { chains, storeId, tag } = await setup();
    const article = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena ${tag}`,
    });
    await deleteProduct(db, { id: article.id, storeId });
    const scope = { id: article.id, storeId };
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
    const { chains, storeId, tag } = await setup();
    const article = await makeArticle(storeId, {
      categoryId: chains.id,
      images: 3,
      title: `Cadena ${tag}`,
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
      storeId,
    });
    const [cover] = (await list(storeId, { category: chains.slug })).items;
    expect(cover?.cover?.url).toBe("/seed/test-2.jpg");

    await expect(
      reorderProductImages(db, {
        id: article.id,
        imageIds: reversed.slice(1),
        storeId,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Give every image of the article, once each",
    });
  });

  test("an edit that takes a published article's price away is refused", async () => {
    const { chains, storeId, tag } = await setup();
    const article = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cadena ${tag}`,
    });

    await expect(
      updateProduct(db, {
        storeId,
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
              title: `Cadena ${tag}`,
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
function deferred<T = undefined>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });

  return { promise, resolve: settle };
}

/**
 * Waits until some query on this database waits on another's lock. Enough
 * where the outcome itself shows which lock was waited on.
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

  throw new Error("The second writer never waited");
}

/** The server process running this transaction's statements. */
async function backendPid(tx: DatabaseClient) {
  const result = await tx.execute<{ pid: number }>(
    sql`select pg_backend_pid() as pid`
  );
  const pid = result.rows[0]?.pid;

  if (pid === undefined) {
    throw new Error("The backend has no process id");
  }

  return pid;
}

/**
 * Waits until the `waiter` process waits on an advisory lock that the
 * `holder` process holds. Only the slug lock is advisory here: a wait on the
 * `(storeId, slug)` unique index, which a writer without the lock would hit,
 * is a different wait and never satisfies this.
 */
async function waitUntilAdvisoryBlocked(waiter: number, holder: number) {
  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const result = await db.execute<{ waiting: boolean }>(sql`
      select exists (
        select 1 from pg_locks
        where pid = ${waiter} and locktype = 'advisory' and not granted
      ) and ${holder} = any(pg_blocking_pids(${waiter})) as waiting
    `);

    if (result.rows[0]?.waiting) {
      return;
    }
  }

  throw new Error("The second writer never waited on the first's slug lock");
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
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const held = deferred();
    const allocated = deferred();
    const firstPid = deferred<number>();
    const secondPid = deferred<number>();
    const register = <T extends { id: number }>(row: T) => {
      created.productIds.push(row.id);

      return row;
    };

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const row = await createProduct(tx, {
        storeId,
        values: draftValues(`Collar Gemelo ${tag}`),
      });
      allocated.resolve(undefined);
      await held.promise;

      return register(row);
    });
    await allocated.promise;
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return register(
        await createProduct(tx, {
          storeId,
          values: draftValues(`Collar Gemelo ${tag}`),
        })
      );
    });

    try {
      await waitUntilAdvisoryBlocked(
        await secondPid.promise,
        await firstPid.promise
      );
    } finally {
      held.resolve(undefined);
      await Promise.allSettled([first, second]);
    }

    const [a, b] = await Promise.all([first, second]);
    expect([a.slug, b.slug]).toEqual([
      `collar-gemelo-${tag}`,
      `collar-gemelo-${tag}-2`,
    ]);
  });
});

describe("an edit and a publication of the same article", () => {
  test("the publication waits for the edit's row lock, then refuses the price the edit took away", async () => {
    const { chains, storeId, tag } = await setup();
    const article = await makeArticle(storeId, {
      categoryId: chains.id,
      publish: false,
      title: `Cadena ${tag}`,
    });
    const held = deferred();
    const locked = deferred();

    // The edit clears a field publishing needs: only a publication that
    // waited for it (the row lock) reads the cleared price and refuses.
    const edit = db.transaction(async (tx) => {
      const updated = await updateProduct(tx, {
        storeId,
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
              title: `Cadena ${tag}`,
            },
          ],
        },
      });
      locked.resolve(undefined);
      await held.promise;

      return updated;
    });
    await Promise.race([locked.promise, edit]);
    const publication = publishProduct(db, { id: article.id, storeId });

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
    const { chains, storeId, tag } = await setup();
    const article = await makeArticle(storeId, {
      categoryId: chains.id,
      publish: false,
      title: `Cadena ${tag}`,
    });

    await expect(
      publishProduct(db, { id: article.id, storeId })
    ).resolves.toEqual({
      id: article.id,
      slug: `cadena-${tag}`,
      status: "published",
    });
  });
});
