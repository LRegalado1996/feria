import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { type DatabaseClient, db } from "@/server/db";
import { attribute, category, product, productImage } from "@/server/db/schema";
import { listPublishedProducts } from "@/server/services/catalog";
import { createCategory } from "@/server/services/category";
import {
  createProduct,
  publishProduct,
  updateProduct,
} from "@/server/services/product";
import { onlyIds, theStoreId, uniqueTag } from "@/server/test/one-store";
import {
  backendPid,
  deferred,
  readyOrFailed,
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilAdvisoryBlocked,
} from "@/server/test/two-writers";

import {
  createAttribute,
  createAttributeValue,
  deleteAttribute,
  deleteAttributeValue,
  listCatalogFilters,
  listStoreAttributes,
  resolveCatalogFilters,
} from "./attribute";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The store is shared (`theStoreId`): what this file created is deleted by
// id after each test, the articles first (their filter values go with
// them), then the filters (their values go with them) and the categories.
const created = {
  attributeIds: [] as number[],
  categoryIds: [] as number[],
  productIds: [] as number[],
};

afterEach(async () => {
  await releaseHeldWriters();
  await db
    .delete(product)
    .where(inArray(product.id, created.productIds.splice(0)));
  await db
    .delete(attribute)
    .where(inArray(attribute.id, created.attributeIds.splice(0)));
  await db
    .delete(category)
    .where(inArray(category.id, created.categoryIds.splice(0)));
});

const inTx = async <T>(write: (tx: DatabaseClient) => Promise<T>) =>
  await db.transaction(async (tx) => await write(tx));

/** A filter of the store, registered for cleanup. */
async function addFilter(storeId: number, nameEs: string, nameEn = nameEs) {
  const row = await inTx(
    async (tx) =>
      await createAttribute(tx, { storeId, values: { nameEn, nameEs } })
  );
  created.attributeIds.push(row.id);

  return row;
}

/**
 * Collares and Pulseras, and a Color filter of three values, all named under
 * one tag so no other test's or the seed's rows ever match them.
 */
async function setup() {
  const storeId = await theStoreId(db);
  const tag = uniqueTag();
  const category = async (nameEs: string) => {
    const row = await inTx(
      async (tx) =>
        await createCategory(tx, {
          storeId,
          values: { nameEn: null, nameEs: `${nameEs} ${tag}` },
        })
    );
    created.categoryIds.push(row.id);

    return row;
  };
  const necklaces = await category("Collares");
  const bracelets = await category("Pulseras");
  const color = await addFilter(storeId, `Color ${tag}`);
  const value = async (nameEs: string, swatchColor: string | null = null) =>
    await inTx(
      async (tx) =>
        await createAttributeValue(tx, {
          attributeId: color.id,
          storeId,
          swatchColor,
          values: { nameEn: null, nameEs: `${nameEs} ${tag}` },
        })
    );
  const gold = await value("Dorado", "#d4af37");
  const purple = await value("Violeta", "#8e44ad");
  const silver = await value("Plateado");

  /** A published article of the store, in a category, carrying values. */
  const article = async (
    title: string,
    categoryId: number,
    valueIds: number[],
    publish = true
  ) => {
    // One transaction, as the router's: a failed filter-value write leaves
    // no article behind that teardown could not find.
    const row = await inTx(
      async (tx) =>
        await createProduct(tx, {
          blobStore: null,
          storeId,
          values: {
            attributeValueIds: valueIds,
            images: [],
            categoryId,
            isAvailable: true,
            priceAmount: 1000,
            translations: [
              {
                description: "",
                locale: "es",
                seoDescription: null,
                seoTitle: null,
                title: `${title} ${tag}`,
              },
            ],
          },
        })
    );
    created.productIds.push(row.id);
    await db.insert(productImage).values({
      height: 100,
      position: 0,
      productId: row.id,
      url: "/seed/ring-1.jpg",
      width: 100,
    });

    if (publish) {
      await publishProduct(db, { id: row.id, storeId });
    }

    return row;
  };

  /**
   * The slugs of the published articles the catalog lists for a query.
   * Without a category it lists every category's, the seed's too, which a
   * test's own values never match.
   */
  const listed = async (
    filters: { attribute: string; values: string[] }[],
    categorySlug?: string
  ) => {
    const valueGroups = await resolveCatalogFilters(db, { filters, storeId });
    const { items } = await listPublishedProducts(db, {
      category: categorySlug,
      currencyCode: "UYU",
      day: "2026-11-25",
      limit: 24,
      locale: "es",
      storeId,
      valueGroups,
    });

    // A set: the order is the list's own concern, tested in the catalog.
    return new Set(items.map((item) => item.slug));
  };

  return {
    article,
    bracelets,
    color,
    gold,
    listed,
    necklaces,
    purple,
    silver,
    storeId,
    tag,
  };
}

describe("catalog filters", () => {
  test("?color=violeta lists every purple article across categories; a category narrows it", async () => {
    const { article, bracelets, color, gold, listed, necklaces, purple } =
      await setup();
    const purpleNecklace = await article("Collar violeta", necklaces.id, [
      purple.id,
    ]);
    const purpleBracelet = await article(
      "Pulsera violeta y dorada",
      bracelets.id,
      [purple.id, gold.id]
    );
    await article("Collar dorado", necklaces.id, [gold.id]);

    expect(
      await listed([{ attribute: color.slug, values: [purple.slug] }])
    ).toEqual(new Set([purpleBracelet.slug, purpleNecklace.slug]));
    expect(
      await listed(
        [{ attribute: color.slug, values: [purple.slug] }],
        necklaces.slug
      )
    ).toEqual(new Set([purpleNecklace.slug]));
  });

  test("values of one filter are alternatives, different filters narrow each other", async () => {
    const { article, color, gold, listed, necklaces, silver, storeId, tag } =
      await setup();
    const material = await addFilter(storeId, `Material ${tag}`);
    const steel = await inTx(
      async (tx) =>
        await createAttributeValue(tx, {
          attributeId: material.id,
          storeId,
          swatchColor: null,
          values: { nameEn: null, nameEs: `Acero ${tag}` },
        })
    );
    const goldSteel = await article("Dorado acero", necklaces.id, [
      gold.id,
      steel.id,
    ]);
    const silverOnly = await article("Plateado", necklaces.id, [silver.id]);
    await article("Sin filtros", necklaces.id, []);

    expect(
      await listed([
        { attribute: color.slug, values: [gold.slug, silver.slug] },
      ])
    ).toEqual(new Set([goldSteel.slug, silverOnly.slug]));
    expect(
      await listed([
        { attribute: color.slug, values: [gold.slug, silver.slug] },
        { attribute: material.slug, values: [steel.slug] },
      ])
    ).toEqual(new Set([goldSteel.slug]));
  });

  test("a filter named twice is still one filter: its values stay alternatives", async () => {
    const { article, color, gold, listed, necklaces, purple } = await setup();
    const goldOnly = await article("Dorado", necklaces.id, [gold.id]);
    const purpleOnly = await article("Violeta", necklaces.id, [purple.id]);

    expect(
      await listed([
        { attribute: color.slug, values: [gold.slug] },
        { attribute: color.slug, values: [purple.slug] },
      ])
    ).toEqual(new Set([goldOnly.slug, purpleOnly.slug]));
  });

  test("an unknown filter or value in the URL is ignored, so an old link still lists", async () => {
    const { article, color, listed, necklaces, purple, tag } = await setup();
    const purpleNecklace = await article("Collar violeta", necklaces.id, [
      purple.id,
    ]);
    const plain = await article("Collar", necklaces.id, []);
    const everything = new Set([plain.slug, purpleNecklace.slug]);

    expect(
      await listed(
        [{ attribute: `talle-${tag}`, values: ["m"] }],
        necklaces.slug
      )
    ).toEqual(everything);
    expect(
      await listed(
        [{ attribute: color.slug, values: [`fucsia-${tag}`] }],
        necklaces.slug
      )
    ).toEqual(everything);
    expect(
      await listed(
        [{ attribute: color.slug, values: [`fucsia-${tag}`, purple.slug] }],
        necklaces.slug
      )
    ).toEqual(new Set([purpleNecklace.slug]));
  });

  test("the storefront offers only values a published article carries, with their counts", async () => {
    const { article, color, gold, necklaces, purple, storeId, tag } =
      await setup();
    await article("Collar violeta", necklaces.id, [purple.id]);
    await article("Otro violeta", necklaces.id, [purple.id]);
    // A draft does not make its value offered.
    await article("Borrador dorado", necklaces.id, [gold.id], false);

    expect(
      (await listCatalogFilters(db, { locale: "en", storeId })).filter(
        (filter) => filter.slug === color.slug
      )
    ).toEqual([
      {
        lang: "en",
        name: `Color ${tag}`,
        slug: color.slug,
        values: [
          {
            count: 2,
            lang: "es",
            name: `Violeta ${tag}`,
            slug: purple.slug,
            swatchColor: "#8e44ad",
          },
        ],
      },
    ]);
  });

  test("a filter none of whose values a published article carries is not offered at all", async () => {
    const { article, color, gold, necklaces, storeId } = await setup();
    await article("Borrador dorado", necklaces.id, [gold.id], false);

    expect(
      (await listCatalogFilters(db, { locale: "es", storeId })).filter(
        (filter) => filter.slug === color.slug
      )
    ).toEqual([]);
  });
});

describe("filter management", () => {
  test("a filter's slug skips the catalog's own parameters and stays unique", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();

    await expect(addFilter(storeId, "Category")).resolves.toMatchObject({
      slug: "category-2",
    });
    await expect(addFilter(storeId, "Q")).resolves.toMatchObject({
      slug: "q-2",
    });
    await expect(addFilter(storeId, `color ${tag}`)).resolves.toMatchObject({
      slug: `color-${tag}`,
    });
    await expect(
      addFilter(storeId, `Color ${tag.toUpperCase()}`)
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That name is already in use here",
    });
  });

  test("a filter value or filter the store no longer has can never be attached, deleted or given a value", async () => {
    const { article, color, gold, necklaces, purple, storeId, tag } =
      await setup();
    const own = await article("Collar", necklaces.id, []);
    await inTx(
      async (tx) => await deleteAttributeValue(tx, { id: gold.id, storeId })
    );
    const material = await addFilter(storeId, `Material ${tag}`);
    await inTx(
      async (tx) => await deleteAttribute(tx, { id: material.id, storeId })
    );

    await expect(
      inTx(
        async (tx) =>
          await updateProduct(tx, {
            blobStore: null,
            storeId,
            values: {
              attributeValueIds: [purple.id, gold.id],
              categoryId: necklaces.id,
              id: own.id,
              // The photo the article holds, kept as it is.
              images: [{ height: 100, url: "/seed/ring-1.jpg", width: 100 }],
              isAvailable: true,
              priceAmount: 1000,
              translations: [
                {
                  description: "",
                  locale: "es",
                  seoDescription: null,
                  seoTitle: null,
                  title: `Collar ${tag}`,
                },
              ],
            },
          })
      )
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter value not found",
    });
    await expect(
      inTx(
        async (tx) => await deleteAttributeValue(tx, { id: gold.id, storeId })
      )
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter value not found",
    });
    await expect(
      inTx(
        async (tx) =>
          await createAttributeValue(tx, {
            attributeId: material.id,
            storeId,
            swatchColor: null,
            values: { nameEn: null, nameEs: `Acero ${tag}` },
          })
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Filter not found" });
    // Its own filter still takes one.
    await expect(
      inTx(
        async (tx) =>
          await createAttributeValue(tx, {
            attributeId: color.id,
            storeId,
            swatchColor: null,
            values: { nameEn: null, nameEs: `Cobre ${tag}` },
          })
      )
    ).resolves.toMatchObject({ slug: `cobre-${tag}` });
  });

  test("deleting a value in use takes it off its articles and says how many", async () => {
    const { article, color, gold, necklaces, purple, silver, storeId } =
      await setup();
    await article("Collar dorado", necklaces.id, [gold.id, purple.id]);
    await article("Otro dorado", necklaces.id, [gold.id]);

    await expect(
      inTx(
        async (tx) => await deleteAttributeValue(tx, { id: gold.id, storeId })
      )
    ).resolves.toEqual({ id: gold.id, removedFromArticles: 2 });

    const [own] = onlyIds(await listStoreAttributes(db, { storeId }), [
      color.id,
    ]);
    expect(
      own?.values.map((value) => [value.slug, value.productCount])
    ).toEqual([
      [purple.slug, 1],
      [silver.slug, 0],
    ]);
  });
});

describe("filter names under two writers", () => {
  /**
   * Two transactions adding a filter named `first` then `second`, the second
   * started once the first wrote and still holds its transaction open.
   */
  async function race(
    storeId: number,
    names: { first: string; second: string }
  ) {
    const held = deferred();
    const written = deferred();
    const firstPid = deferred<number>();
    const secondPid = deferred<number>();
    const add = async (tx: DatabaseClient, nameEs: string) => {
      const row = await createAttribute(tx, {
        storeId,
        values: { nameEn: null, nameEs },
      });
      created.attributeIds.push(row.id);

      return row;
    };

    // Released however the test ends, a timeout included: an open first
    // transaction would hold its lock past the test.
    const writers: Promise<unknown>[] = [];
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled(writers)
    );

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const row = await add(tx, names.first);
      written.resolve(undefined);
      await held.promise;

      return row;
    });
    writers.push(first);
    await readyOrFailed(written.promise, first);
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await add(tx, names.second);
    });
    writers.push(second);

    return {
      first,
      firstPid: readyOrFailed(firstPid.promise, first),
      release: async () => {
        held.resolve(undefined);
        await Promise.allSettled([first, second]);
      },
      second,
      secondPid: readyOrFailed(secondPid.promise, second),
    };
  }

  test("the same name added twice at once ends in one filter and one CONFLICT", async () => {
    const storeId = await theStoreId(db);
    const tag = uniqueTag();
    const run = await race(storeId, {
      first: `Color ${tag}`,
      second: `colór ${tag}`,
    });

    try {
      await waitUntilAdvisoryBlocked(
        db,
        await run.secondPid,
        await run.firstPid
      );
    } finally {
      await run.release();
    }

    await expect(run.first).resolves.toMatchObject({ slug: `color-${tag}` });
    await expect(run.second).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That name is already in use here",
    });
    expect(
      (await listStoreAttributes(db, { storeId }))
        .filter((row) => row.slug.endsWith(tag))
        .map((row) => row.nameEs)
    ).toEqual([`Color ${tag}`]);
  });
});
