import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";

import { createStoreSchema } from "@/lib/schemas/store";
import { type DatabaseClient, db } from "@/server/db";
import { productImage, store } from "@/server/db/schema";
import {
  createProduct,
  listPublishedProducts,
  publishProduct,
} from "@/server/services/catalog";
import { createCategory } from "@/server/services/category";
import { createStore } from "@/server/services/store";
import {
  backendPid,
  deferred,
  waitUntilAdvisoryBlocked,
} from "@/server/test/two-writers";

import {
  createAttribute,
  createAttributeValue,
  deleteAttributeValue,
  listCatalogFilters,
  listStoreAttributes,
  resolveCatalogFilters,
  setProductAttributeValues,
} from "./attribute";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Deleting a store cascades to its filters, values, categories and articles.
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
      name: "Filters Test",
      slug: `filters-${randomUUID().slice(0, 8)}`,
      tiktokUrl: null,
      translations: [],
      whatsappNumber: null,
    })
  );
  createdStoreIds.push(row.id);

  return row;
}

const inTx = async <T>(write: (tx: DatabaseClient) => Promise<T>) =>
  await db.transaction(async (tx) => await write(tx));

/** A store with Collares and Pulseras, and a Color filter of three values. */
async function setup() {
  const shop = await makeStore();
  const necklaces = await inTx(
    async (tx) =>
      await createCategory(tx, {
        storeId: shop.id,
        values: { nameEn: null, nameEs: "Collares" },
      })
  );
  const bracelets = await inTx(
    async (tx) =>
      await createCategory(tx, {
        storeId: shop.id,
        values: { nameEn: null, nameEs: "Pulseras" },
      })
  );
  const color = await inTx(
    async (tx) =>
      await createAttribute(tx, {
        storeId: shop.id,
        values: { nameEn: "Color", nameEs: "Color" },
      })
  );
  const value = async (nameEs: string, swatchColor: string | null = null) =>
    await inTx(
      async (tx) =>
        await createAttributeValue(tx, {
          attributeId: color.id,
          storeId: shop.id,
          swatchColor,
          values: { nameEn: null, nameEs },
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
    const created = await createProduct(db, {
      storeId: shop.id,
      values: {
        categoryId,
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
    await db.insert(productImage).values({
      height: 100,
      position: 0,
      productId: created.id,
      url: "/seed/ring-1.jpg",
      width: 100,
    });

    if (publish) {
      await publishProduct(db, { id: created.id, storeId: shop.id });
    }

    await inTx(
      async (tx) =>
        await setProductAttributeValues(tx, {
          productId: created.id,
          storeId: shop.id,
          valueIds,
        })
    );

    return created;
  };

  /** The slugs of the published articles the catalog lists for a query. */
  const listed = async (
    filters: { attribute: string; values: string[] }[],
    category?: string
  ) => {
    const valueGroups = await resolveCatalogFilters(db, {
      filters,
      storeId: shop.id,
    });
    const { items } = await listPublishedProducts(db, {
      category,
      currencyCode: "UYU",
      limit: 24,
      locale: "es",
      storeId: shop.id,
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
    shop,
    silver,
  };
}

describe("catalog filters", () => {
  test("?color=violeta lists every purple article across categories; a category narrows it", async () => {
    const { article, bracelets, gold, listed, necklaces, purple } =
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

    expect(await listed([{ attribute: "color", values: ["violeta"] }])).toEqual(
      new Set([purpleBracelet.slug, purpleNecklace.slug])
    );
    expect(
      await listed([{ attribute: "color", values: ["violeta"] }], "collares")
    ).toEqual(new Set([purpleNecklace.slug]));
  });

  test("values of one filter are alternatives, different filters narrow each other", async () => {
    const { article, gold, listed, necklaces, shop, silver } = await setup();
    const material = await inTx(
      async (tx) =>
        await createAttribute(tx, {
          storeId: shop.id,
          values: { nameEn: null, nameEs: "Material" },
        })
    );
    const steel = await inTx(
      async (tx) =>
        await createAttributeValue(tx, {
          attributeId: material.id,
          storeId: shop.id,
          swatchColor: null,
          values: { nameEn: null, nameEs: "Acero" },
        })
    );
    const goldSteel = await article("Dorado acero", necklaces.id, [
      gold.id,
      steel.id,
    ]);
    const silverOnly = await article("Plateado", necklaces.id, [silver.id]);
    await article("Sin filtros", necklaces.id, []);

    expect(
      await listed([{ attribute: "color", values: ["dorado", "plateado"] }])
    ).toEqual(new Set([goldSteel.slug, silverOnly.slug]));
    expect(
      await listed([
        { attribute: "color", values: ["dorado", "plateado"] },
        { attribute: "material", values: ["acero"] },
      ])
    ).toEqual(new Set([goldSteel.slug]));
  });

  test("a filter named twice is still one filter: its values stay alternatives", async () => {
    const { article, gold, listed, necklaces, purple } = await setup();
    const goldOnly = await article("Dorado", necklaces.id, [gold.id]);
    const purpleOnly = await article("Violeta", necklaces.id, [purple.id]);

    expect(
      await listed([
        { attribute: "color", values: ["dorado"] },
        { attribute: "color", values: ["violeta"] },
      ])
    ).toEqual(new Set([goldOnly.slug, purpleOnly.slug]));
  });

  test("an unknown filter or value in the URL is ignored, so an old link still lists", async () => {
    const { article, listed, necklaces, purple } = await setup();
    const purpleNecklace = await article("Collar violeta", necklaces.id, [
      purple.id,
    ]);
    const plain = await article("Collar", necklaces.id, []);
    const everything = new Set([plain.slug, purpleNecklace.slug]);

    expect(await listed([{ attribute: "talle", values: ["m"] }])).toEqual(
      everything
    );
    expect(await listed([{ attribute: "color", values: ["fucsia"] }])).toEqual(
      everything
    );
    expect(
      await listed([{ attribute: "color", values: ["fucsia", "violeta"] }])
    ).toEqual(new Set([purpleNecklace.slug]));
  });

  test("the storefront offers only values a published article carries, with their counts", async () => {
    const { article, gold, necklaces, purple, shop } = await setup();
    await article("Collar violeta", necklaces.id, [purple.id]);
    await article("Otro violeta", necklaces.id, [purple.id]);
    // A draft does not make its value offered.
    await article("Borrador dorado", necklaces.id, [gold.id], false);

    expect(
      await listCatalogFilters(db, { locale: "en", storeId: shop.id })
    ).toEqual([
      {
        lang: "en",
        name: "Color",
        slug: "color",
        values: [
          {
            count: 2,
            lang: "es",
            name: "Violeta",
            slug: "violeta",
            swatchColor: "#8e44ad",
          },
        ],
      },
    ]);
  });

  test("a store with no carried values offers no filter at all", async () => {
    const { shop } = await setup();

    expect(
      await listCatalogFilters(db, { locale: "es", storeId: shop.id })
    ).toEqual([]);
  });
});

describe("filter management", () => {
  test("a filter's slug skips the catalog's own parameters and stays unique", async () => {
    const shop = await makeStore();
    const add = async (nameEs: string) =>
      await inTx(
        async (tx) =>
          await createAttribute(tx, {
            storeId: shop.id,
            values: { nameEn: null, nameEs },
          })
      );

    await expect(add("Category")).resolves.toMatchObject({
      slug: "category-2",
    });
    await expect(add("Q")).resolves.toMatchObject({ slug: "q-2" });
    await expect(add("color")).resolves.toMatchObject({ slug: "color" });
    await expect(add("Color")).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That name is already in use here",
    });
  });

  test("another store's filter value can never be attached, read or deleted through this store", async () => {
    const { necklaces, article, shop } = await setup();
    const other = await setup();
    const own = await article("Collar", necklaces.id, []);

    await expect(
      inTx(
        async (tx) =>
          await setProductAttributeValues(tx, {
            productId: own.id,
            storeId: shop.id,
            valueIds: [other.gold.id],
          })
      )
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter value not found",
    });
    await expect(
      inTx(
        async (tx) =>
          await deleteAttributeValue(tx, {
            id: other.gold.id,
            storeId: shop.id,
          })
      )
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter value not found",
    });
    await expect(
      inTx(
        async (tx) =>
          await createAttributeValue(tx, {
            attributeId: other.color.id,
            storeId: shop.id,
            swatchColor: null,
            values: { nameEn: null, nameEs: "Robado" },
          })
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Filter not found" });
  });

  test("deleting a value in use takes it off its articles and says how many", async () => {
    const { article, gold, necklaces, purple, shop } = await setup();
    await article("Collar dorado", necklaces.id, [gold.id, purple.id]);
    await article("Otro dorado", necklaces.id, [gold.id]);

    await expect(
      inTx(
        async (tx) =>
          await deleteAttributeValue(tx, { id: gold.id, storeId: shop.id })
      )
    ).resolves.toEqual({ id: gold.id, removedFromArticles: 2 });

    const [color] = await listStoreAttributes(db, { storeId: shop.id });
    expect(
      color?.values.map((value) => [value.slug, value.productCount])
    ).toEqual([
      ["violeta", 1],
      ["plateado", 0],
    ]);
  });
});

describe("filter names under two writers", () => {
  /**
   * Two transactions adding a filter named `first` then `second`, the second
   * started once the first wrote and still holds its transaction open.
   */
  async function race(
    stores: { first: number; second: number },
    names: { first: string; second: string }
  ) {
    const held = deferred();
    const written = deferred();
    const firstPid = deferred<number>();
    const secondPid = deferred<number>();
    const add = async (tx: DatabaseClient, storeId: number, nameEs: string) =>
      await createAttribute(tx, {
        storeId,
        values: { nameEn: null, nameEs },
      });

    // Released however the test ends, a timeout included: an open first
    // transaction would hold its lock and the store row past the test.
    onTestFinished(() => {
      held.resolve(undefined);
    });

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const created = await add(tx, stores.first, names.first);
      written.resolve(undefined);
      await held.promise;

      return created;
    });
    await written.promise;
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await add(tx, stores.second, names.second);
    });

    return {
      first,
      firstPid: firstPid.promise,
      release: async () => {
        held.resolve(undefined);
        await Promise.allSettled([first, second]);
      },
      second,
      secondPid: secondPid.promise,
    };
  }

  test("the same name added twice at once ends in one filter and one CONFLICT", async () => {
    const shop = await makeStore();
    const run = await race(
      { first: shop.id, second: shop.id },
      { first: "Color", second: "colór" }
    );

    try {
      await waitUntilAdvisoryBlocked(
        db,
        await run.secondPid,
        await run.firstPid
      );
    } finally {
      await run.release();
    }

    await expect(run.first).resolves.toMatchObject({ slug: "color" });
    await expect(run.second).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That name is already in use here",
    });
    expect(
      (await listStoreAttributes(db, { storeId: shop.id })).map(
        (row) => row.nameEs
      )
    ).toEqual(["Color"]);
  });

  test("control: a store's filter lock never makes another store wait", async () => {
    const [storeA, storeB] = [await makeStore(), await makeStore()];
    const run = await race(
      { first: storeA.id, second: storeB.id },
      { first: "Color", second: "Color" }
    );

    try {
      // Finishes while store A's transaction still holds its lock: with one
      // lock for every store this would wait for ever.
      await expect(run.second).resolves.toMatchObject({ slug: "color" });
    } finally {
      await run.release();
    }

    await expect(run.first).resolves.toMatchObject({ slug: "color" });
  });
});
