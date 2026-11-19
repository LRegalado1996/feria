import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import {
  category,
  categoryTranslation,
  product,
  productImage,
  productImageTranslation,
} from "@/server/db/schema";
import { onlyIds, theStoreId, uniqueTag } from "@/server/test/one-store";

import {
  getPublishedProduct,
  listCartProducts,
  listCategories,
  listPublishedProducts,
  listRelatedProducts,
} from "./catalog";
import {
  createProduct,
  deleteProduct,
  publishProduct,
  setProductAvailability,
} from "./product";

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
  // One transaction, as the router's: a failed write of its contents leaves
  // no draft behind that teardown could not find.
  const row = await db.transaction(
    async (tx) =>
      await createProduct(tx, {
        // The photos are the site's files, inserted below: no upload to check.
        blobStore: null,
        storeId,
        values: {
          attributeValueIds: [],
          categoryId: options.categoryId,
          images: [],
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
      })
  );
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

    const newest = { category: chains.slug, limit: 2, sort: "newest" } as const;
    const pageOne = await list(storeId, newest);
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
      ...newest,
      cursor: pageOne.nextCursor ?? undefined,
    });
    const pageThree = await list(storeId, {
      ...newest,
      cursor: pageTwo.nextCursor ?? undefined,
    });

    const seen = [...pageOne.items, ...pageTwo.items, ...pageThree.items].map(
      (item) => item.slug
    );
    expect(seen).toEqual(first);
    expect(pageThree.nextCursor).toBeNull();
  });

  test("lists in the store's own order by default, a new article last, across pages without a repeat (FER-044)", async () => {
    const { chains, storeId, tag } = await setup();
    const made: { id: number; slug: string }[] = [];

    for (const title of ["Primera", "Segunda", "Tercera"]) {
      made.push(
        await makeArticle(storeId, {
          categoryId: chains.id,
          title: `${title} ${tag}`,
        })
      );
    }

    // Each published as it was made: the newest first would read Primera
    // last, so only the store's order reads it first.
    const pageOne = await list(storeId, { category: chains.slug, limit: 2 });
    // Added while the visitor reads page one: it goes after every other.
    const added = await makeArticle(storeId, {
      categoryId: chains.id,
      title: `Cuarta ${tag}`,
    });
    const pageTwo = await list(storeId, {
      category: chains.slug,
      cursor: pageOne.nextCursor ?? undefined,
      limit: 2,
    });
    const [second] = made.slice(1, 2);
    const positions = await db
      .select({ id: product.id, position: product.position })
      .from(product)
      .where(
        inArray(
          product.id,
          [...made, added].map((row) => row.id)
        )
      );
    const positionOf = new Map(positions.map((row) => [row.id, row.position]));

    expect(
      [...pageOne.items, ...pageTwo.items].map((item) => item.slug)
    ).toEqual([...made, added].map((row) => row.slug));
    expect(pageOne.nextCursor).toEqual({
      id: second?.id,
      position: positionOf.get(second?.id ?? 0),
      sort: "position",
    });
    expect(pageTwo.nextCursor).toBeNull();
    // Each later one numbered after the one before.
    const numbers = [...made, added].map((row) => positionOf.get(row.id) ?? 0);
    expect(
      numbers.every(
        (value, index) => index === 0 || value > (numbers[index - 1] ?? value)
      )
    ).toBe(true);
  });

  test("ties in the store's order are broken by id, never repeating a row", async () => {
    const { chains, storeId, tag } = await setup();
    const made: { id: number; slug: string }[] = [];

    for (const title of ["A", "B", "C"]) {
      made.push(
        await makeArticle(storeId, {
          categoryId: chains.id,
          title: `Empate ${title} ${tag}`,
        })
      );
    }

    // One place for all three, as a reorder could leave them.
    await db
      .update(product)
      .set({ position: 7 })
      .where(
        inArray(
          product.id,
          made.map((row) => row.id)
        )
      );
    const pageOne = await list(storeId, { category: chains.slug, limit: 2 });
    const pageTwo = await list(storeId, {
      category: chains.slug,
      cursor: pageOne.nextCursor ?? undefined,
      limit: 2,
    });

    expect(
      [...pageOne.items, ...pageTwo.items].map((item) => item.slug)
    ).toEqual(made.map((row) => row.slug));
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
    const newest = await list(storeId, {
      category: chains.slug,
      limit: 1,
      sort: "newest",
    });

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
