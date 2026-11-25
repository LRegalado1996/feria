import { randomUUID } from "node:crypto";

import { asc, eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ProductImageValues } from "@/lib/schemas/catalog";
import { type DatabaseClient, db } from "@/server/db";
import {
  attribute,
  attributeValue,
  category,
  categoryTranslation,
  product,
  productAttributeValue,
  productImage,
  productImageTranslation,
  productTranslation,
} from "@/server/db/schema";
import {
  getPublishedProduct,
  listPublishedProducts,
} from "@/server/services/catalog";
import { theStoreId, uniqueTag } from "@/server/test/one-store";
import {
  backendPid,
  deferred,
  readyOrFailed,
  releaseHeldWriters,
  releaseOnTeardown,
  waitUntilAdvisoryBlocked,
  waitUntilBlockedBy,
} from "@/server/test/two-writers";

import {
  createProduct,
  deleteProduct,
  getStoreProduct,
  listStoreProducts,
  publishProduct,
  setProductAvailability,
  unpublishProduct,
  updateProduct,
} from "./product";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// The store is shared (`theStoreId`): a test reads only the articles it
// created, by id, and deletes them after it, the articles first (their
// texts, photos and values go with them), then its categories and filters.
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
    .delete(category)
    .where(inArray(category.id, created.categoryIds.splice(0)));
  await db
    .delete(attribute)
    .where(inArray(attribute.id, created.attributeIds.splice(0)));
});

const HOST = "store9.public.blob.vercel-storage.com";
const BLOB_STORE = { host: HOST, namespace: "qa", token: "unused" } as const;

/** A new upload of this deployment for articles, as the browser saves one. */
function upload(): ProductImageValues {
  return {
    height: 1600,
    url: `https://${HOST}/qa/product/${randomUUID()}.webp`,
    width: 1200,
  };
}

/** A photo saved before uploads: a file of the site. */
function sitePhoto(file: string): ProductImageValues {
  return { height: 800, url: `/seed/${file}`, width: 800 };
}

function spanish(title: string, description = "") {
  return {
    description,
    locale: "es" as const,
    seoDescription: null,
    seoTitle: null,
    title,
  };
}

function english(title: string, description = "") {
  return { ...spanish(title, description), locale: "en" as const };
}

type Values = Parameters<typeof createProduct>[1]["values"];

/** A complete article's values, ready to publish, with overrides. */
function articleValues(overrides: Partial<Values> = {}): Values {
  return {
    attributeValueIds: [],
    categoryId: null,
    images: [upload()],
    isAvailable: true,
    priceAmount: 129_000,
    translations: [spanish(`Cadena ${uniqueTag()}`)],
    ...overrides,
  };
}

/** The store, a tag for this test's names and a category of its own. */
async function setup() {
  const storeId = await theStoreId(db);
  const tag = uniqueTag();
  const [row] = await db
    .insert(category)
    .values({ position: 0, slug: `cadenas-${tag}`, storeId })
    .returning();

  if (!row) {
    throw new Error("no category");
  }

  created.categoryIds.push(row.id);
  await db
    .insert(categoryTranslation)
    .values({ categoryId: row.id, locale: "es", name: `Cadenas ${tag}` });

  // Each write in a transaction of its own, as the router's, unless a
  // two-writer test hands it the one it holds open: a refused write then
  // leaves nothing behind, and its locks last until it ends.
  const create = async (overrides: Partial<Values> = {}) => {
    const article = await db.transaction(
      async (tx) =>
        await createProduct(tx, {
          blobStore: BLOB_STORE,
          storeId,
          values: articleValues({ categoryId: row.id, ...overrides }),
        })
    );
    created.productIds.push(article.id);

    return article;
  };
  const save = async (
    id: number,
    overrides: Partial<Values> = {},
    client?: DatabaseClient
  ) => {
    const write = async (tx: DatabaseClient) =>
      await updateProduct(tx, {
        blobStore: BLOB_STORE,
        storeId,
        values: { ...articleValues({ categoryId: row.id, ...overrides }), id },
      });

    return client ? await write(client) : await db.transaction(write);
  };
  const photosOf = async (id: number) =>
    await db
      .select({
        id: productImage.id,
        position: productImage.position,
        url: productImage.url,
      })
      .from(productImage)
      .where(eq(productImage.productId, id))
      .orderBy(asc(productImage.position), asc(productImage.id));

  return { category: row, create, photosOf, save, storeId, tag };
}

describe("drafts without a title (FER-017)", () => {
  test("two blank drafts each get a free slug of the fallback, and keep a valid one on every save", async () => {
    const { create, save } = await setup();
    const blank = { translations: [spanish("")] };

    const first = await create(blank);
    const second = await create(blank);

    const slugOf = async (id: number) =>
      (
        await db.query.product.findFirst({
          columns: { slug: true },
          where: eq(product.id, id),
        })
      )?.slug;
    expect(first.slug).toMatch(/^articulo(?:-\d+)?$/u);
    expect(second.slug).toMatch(/^articulo(?:-\d+)?$/u);
    expect(second.slug).not.toBe(first.slug);

    // An autosave that still has no title keeps a slug of the fallback,
    // never one another article holds.
    await expect(save(second.id, blank)).resolves.toMatchObject({
      slug: second.slug,
    });
    await expect(save(second.id, blank)).resolves.toMatchObject({
      slug: second.slug,
    });
    expect(await slugOf(first.id)).toBe(first.slug);
  });

  test("a blank draft is stored with an empty Spanish title, then follows the title it is given", async () => {
    const { create, save, tag } = await setup();
    const draft = await create({ translations: [spanish("")] });

    await expect(
      db
        .select({
          locale: productTranslation.locale,
          title: productTranslation.title,
        })
        .from(productTranslation)
        .where(eq(productTranslation.productId, draft.id))
    ).resolves.toEqual([{ locale: "es", title: "" }]);
    await expect(
      save(draft.id, { translations: [spanish(`Pulsera ${tag}`)] })
    ).resolves.toMatchObject({ slug: `pulsera-${tag}` });
  });

  test("a blank draft is refused publishing, and the storefront never shows it", async () => {
    const { category: own, create, storeId } = await setup();
    const draft = await create({ translations: [spanish("")] });

    await expect(
      publishProduct(db, { id: draft.id, storeId })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: spanishTitle",
    });
    await expect(
      getPublishedProduct(db, {
        currencyCode: "UYU",
        locale: "es",
        slug: draft.slug,
        storeId,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      listPublishedProducts(db, {
        category: own.slug,
        currencyCode: "UYU",
        day: "2026-11-25",
        limit: 24,
        locale: "en",
        storeId,
      })
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  test("an English text without its title blocks publishing, so a published article never shows a blank one", async () => {
    const { create, save, storeId, tag } = await setup();
    const images = [upload()];
    const article = await create({
      images,
      translations: [spanish(`Anillo ${tag}`), english("", "Gold ring")],
    });

    await expect(
      publishProduct(db, { id: article.id, storeId })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: englishTitle",
    });

    await save(article.id, {
      images,
      translations: [spanish(`Anillo ${tag}`), english("Ring", "Gold ring")],
    });
    await expect(
      publishProduct(db, { id: article.id, storeId })
    ).resolves.toMatchObject({ status: "published" });
  });
});

describe("saving an article's photos", () => {
  test("a held photo keeps its row and its alt text, moves, a new one is added and a dropped one handed over", async () => {
    const { create, photosOf, save } = await setup();
    const [a, b, c] = [upload(), upload(), upload()];
    const article = await create({ images: [a, b] });
    const [first, second] = await photosOf(article.id);

    if (!(first && second)) {
      throw new Error("no photos");
    }

    await db.insert(productImageTranslation).values({
      altText: "Cadena dorada",
      locale: "es",
      productImageId: second.id,
    });

    // B becomes the main photo, A goes, C is new.
    const saved = await save(article.id, { images: [b, c] });

    expect(saved.discardedImageUrls).toEqual([a.url]);
    const photos = await photosOf(article.id);
    expect(photos.map(({ position, url }) => [position, url])).toEqual([
      [0, b.url],
      [1, c.url],
    ]);
    // B is the same row as before, its alt text still on it.
    expect(photos[0]?.id).toBe(second.id);
    await expect(
      db
        .select({ altText: productImageTranslation.altText })
        .from(productImageTranslation)
        .where(eq(productImageTranslation.productImageId, second.id))
    ).resolves.toEqual([{ altText: "Cadena dorada" }]);
  });

  test("a photo of the site the article holds is kept as it is; one it does not hold is refused", async () => {
    const { create, photosOf, save } = await setup();
    const article = await create({ images: [] });
    await db.insert(productImage).values({
      ...sitePhoto("ring-1.jpg"),
      position: 0,
      productId: article.id,
    });

    await expect(
      save(article.id, { images: [sitePhoto("ring-1.jpg"), upload()] })
    ).resolves.toMatchObject({ discardedImageUrls: [] });
    await expect(
      save(article.id, { images: [sitePhoto("ring-2.jpg")] })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "An article photo must be one uploaded to this store",
    });
    expect((await photosOf(article.id)).map((photo) => photo.url)).toEqual([
      "/seed/ring-1.jpg",
      expect.stringMatching(/^https:\/\/store9\./u),
    ]);
  });

  test.each([
    [
      "another store's",
      `https://other.public.blob.vercel-storage.com/qa/product/${randomUUID()}.webp`,
    ],
    [
      "another deployment's",
      `https://${HOST}/production/product/${randomUUID()}.webp`,
    ],
    ["a cover's", `https://${HOST}/qa/cover/${randomUUID()}.webp`],
  ])(
    "an upload of %s is refused and the article left as it was",
    async (_case, url) => {
      const { create, photosOf, save } = await setup();
      const kept = upload();
      const article = await create({ images: [kept] });

      await expect(
        save(article.id, { images: [kept, { height: 10, url, width: 10 }] })
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "An article photo must be one uploaded to this store",
      });
      expect((await photosOf(article.id)).map((photo) => photo.url)).toEqual([
        kept.url,
      ]);
    }
  );

  test("a published article cannot lose its last photo; a draft can", async () => {
    const { create, photosOf, save, storeId } = await setup();
    const photo = upload();
    const article = await create({ images: [photo] });
    await publishProduct(db, { id: article.id, storeId });

    await expect(save(article.id, { images: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: image",
    });
    expect((await photosOf(article.id)).map((row) => row.url)).toEqual([
      photo.url,
    ]);

    await unpublishProduct(db, { id: article.id, storeId });
    await expect(save(article.id, { images: [] })).resolves.toMatchObject({
      discardedImageUrls: [photo.url],
      publishGaps: ["image"],
    });
  });
});

describe("saving an article's texts and filter values", () => {
  test("a language the article keeps stays the same row; one left out is deleted", async () => {
    const { create, save, tag } = await setup();
    const images = [upload()];
    const article = await create({
      images,
      translations: [spanish(`Aro ${tag}`), english(`Earring ${tag}`)],
    });
    const rowsOf = async () =>
      await db
        .select({
          id: productTranslation.id,
          locale: productTranslation.locale,
          title: productTranslation.title,
        })
        .from(productTranslation)
        .where(eq(productTranslation.productId, article.id))
        .orderBy(asc(productTranslation.locale));
    const before = await rowsOf();

    await save(article.id, {
      images,
      translations: [spanish(`Aros ${tag}`), english(`Earrings ${tag}`)],
    });
    const after = await rowsOf();
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(after.map((row) => row.title)).toEqual([
      `Aros ${tag}`,
      `Earrings ${tag}`,
    ]);

    await save(article.id, {
      images,
      translations: [spanish(`Aros ${tag}`)],
    });
    expect((await rowsOf()).map((row) => row.locale)).toEqual(["es"]);
  });

  test("the filter values replace the ones the article had; another store's or a deleted value is refused", async () => {
    const { create, save, storeId, tag } = await setup();
    const [color] = await db
      .insert(attribute)
      .values({ position: 0, slug: `color-${tag}`, storeId })
      .returning();

    if (!color) {
      throw new Error("no filter");
    }

    created.attributeIds.push(color.id);
    const values = await db
      .insert(attributeValue)
      .values(
        ["dorado", "plateado", "violeta"].map((slug, position) => ({
          attributeId: color.id,
          position,
          slug,
        }))
      )
      .returning({ id: attributeValue.id });
    const [gold, silver, purple] = values.map((row) => row.id);

    if (gold === undefined || silver === undefined || purple === undefined) {
      throw new Error("no values");
    }

    const images = [upload()];
    const article = await create({ attributeValueIds: [gold, silver], images });
    const carried = async () =>
      (
        await db
          .select({ id: productAttributeValue.attributeValueId })
          .from(productAttributeValue)
          .where(eq(productAttributeValue.productId, article.id))
          .orderBy(asc(productAttributeValue.attributeValueId))
      ).map((row) => row.id);
    expect(await carried()).toEqual([gold, silver]);

    await save(article.id, { attributeValueIds: [silver, purple], images });
    expect(await carried()).toEqual([silver, purple]);

    await db.delete(attributeValue).where(eq(attributeValue.id, purple));
    const before = await getStoreProduct(db, { id: article.id, storeId });
    // Another title too: a refused save writes none of its other fields.
    await expect(
      save(article.id, {
        attributeValueIds: [silver, purple],
        images: [...images, upload()],
        translations: [spanish(`Rechazado ${tag}`)],
      })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter value not found",
    });
    expect(await carried()).toEqual([silver]);
    await expect(
      getStoreProduct(db, { id: article.id, storeId })
    ).resolves.toEqual(before);
  });
});

describe("the admin's reads", () => {
  test("get restores everything a save wrote, and NOT_FOUND for an article the store does not have", async () => {
    const { category: own, create, save, storeId, tag } = await setup();
    const [a, b] = [upload(), upload()];
    const article = await create({ images: [a] });
    await save(article.id, {
      images: [b, a],
      isAvailable: false,
      priceAmount: 99_000,
      translations: [
        { ...spanish(`Collar ${tag}`, "Hecho a mano"), seoTitle: "Collar" },
        english(`Necklace ${tag}`),
      ],
    });

    const restored = await getStoreProduct(db, { id: article.id, storeId });

    expect(restored).toMatchObject({
      attributeValueIds: [],
      categoryId: own.id,
      currencyCode: expect.stringMatching(/^(UYU|USD)$/u),
      id: article.id,
      isAvailable: false,
      priceAmount: 99_000,
      publishGaps: [],
      publishedAt: null,
      slug: `collar-${tag}`,
      status: "draft",
      translations: [
        {
          description: "Hecho a mano",
          locale: "es",
          seoDescription: null,
          seoTitle: "Collar",
          title: `Collar ${tag}`,
        },
        {
          description: "",
          locale: "en",
          seoDescription: null,
          seoTitle: null,
          title: `Necklace ${tag}`,
        },
      ],
    });
    expect(restored.images.map((image) => image.url)).toEqual([b.url, a.url]);

    await deleteProduct(db, { id: article.id, storeId });
    await expect(
      getStoreProduct(db, { id: article.id, storeId })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });
  });
});

/** A category of the store, named in Spanish (and English), in a group or not. */
async function insertCategory({
  nameEn,
  nameEs,
  parentId = null,
  slug,
  storeId,
}: {
  nameEn?: string;
  nameEs: string;
  parentId?: number | null;
  slug: string;
  storeId: number;
}) {
  const [row] = await db
    .insert(category)
    .values({ parentId, position: 0, slug, storeId })
    .returning();

  if (!row) {
    throw new Error("no category");
  }

  created.categoryIds.push(row.id);
  await db
    .insert(categoryTranslation)
    .values([
      { categoryId: row.id, locale: "es" as const, name: nameEs },
      ...(nameEn
        ? [{ categoryId: row.id, locale: "en" as const, name: nameEn }]
        : []),
    ]);

  return row;
}

/** A filter of the store with `values`, their ids by slug. */
async function insertFilter(
  slug: string,
  values: readonly string[],
  storeId: number
) {
  const [row] = await db
    .insert(attribute)
    .values({ position: 0, slug, storeId })
    .returning();

  if (!row) {
    throw new Error("no filter");
  }

  created.attributeIds.push(row.id);
  const rows = await db
    .insert(attributeValue)
    .values(
      values.map((value, position) => ({
        attributeId: row.id,
        position,
        slug: value,
      }))
    )
    .returning({ id: attributeValue.id, slug: attributeValue.slug });
  const idOf = (value: string) => {
    const found = rows.find((one) => one.slug === value);

    if (!found) {
      throw new Error(`no value ${value}`);
    }

    return found.id;
  };

  return { idOf, slug: row.slug };
}

/** Sets each article's last change, so the default order is known. */
async function changedAt(changes: readonly [number, string][]) {
  for (const [id, at] of changes) {
    await db
      .update(product)
      .set({ updatedAt: new Date(at) })
      .where(eq(product.id, id));
  }
}

describe("the admin's list (FER-019)", () => {
  /**
   * Three articles of this test, every title holding its tag: A published
   * in a group's category, gold; B a draft, unavailable, in another of the
   * group's categories, purple and small; C published in a category in no
   * group, gold and small. Two filters of this test, color and size.
   */
  async function setupCatalog() {
    const base = await setup();
    const { create, storeId, tag } = base;
    const group = await insertCategory({
      nameEs: `Bijouterie ${tag}`,
      slug: `bijouterie-${tag}`,
      storeId,
    });
    const rings = await insertCategory({
      nameEs: `Anillos ${tag}`,
      parentId: group.id,
      slug: `anillos-${tag}`,
      storeId,
    });
    const earrings = await insertCategory({
      nameEs: `Aros ${tag}`,
      parentId: group.id,
      slug: `aros-${tag}`,
      storeId,
    });
    const color = await insertFilter(
      `color-${tag}`,
      ["dorado", "violeta"],
      storeId
    );
    const size = await insertFilter(`talle-${tag}`, ["s", "m"], storeId);
    const a = await create({
      attributeValueIds: [color.idOf("dorado")],
      categoryId: rings.id,
      translations: [spanish(`Anillo A ${tag}`)],
    });
    const b = await create({
      attributeValueIds: [color.idOf("violeta"), size.idOf("s")],
      categoryId: earrings.id,
      isAvailable: false,
      translations: [spanish(`Aro B ${tag}`)],
    });
    const c = await create({
      attributeValueIds: [color.idOf("dorado"), size.idOf("s")],
      translations: [spanish(`Cadena C ${tag}`)],
    });
    await publishProduct(db, { id: a.id, storeId });
    await publishProduct(db, { id: c.id, storeId });
    await changedAt([
      [a.id, "2999-01-03T00:00:00.000Z"],
      [b.id, "2999-01-02T00:00:00.000Z"],
      [c.id, "2999-01-01T00:00:00.000Z"],
    ]);
    const names = new Map([
      [a.id, "A"],
      [b.id, "B"],
      [c.id, "C"],
    ]);
    const list = async (
      options: Partial<Parameters<typeof listStoreProducts>[1]> = {}
    ) =>
      await listStoreProducts(db, {
        limit: 24,
        locale: "es",
        page: 1,
        q: tag,
        sort: "updated",
        storeId,
        ...options,
      });
    /** The page's articles by their letters, in its order. */
    const listed = async (
      options: Partial<Parameters<typeof listStoreProducts>[1]> = {}
    ) => (await list(options)).items.map((item) => names.get(item.id) ?? "?");

    return { ...base, color, earrings, group, list, listed, rings, size };
  }

  test("searches the titles in either language, blind to case and accents", async () => {
    const { create, storeId, tag } = await setup();
    const rhea = await create({
      translations: [
        spanish(`Collar Ñandú ${tag}`),
        english(`Rhea necklace ${tag}`),
      ],
    });
    await create({ translations: [spanish(`Pulsera ${tag}`)] });
    const search = async (q: string) =>
      (
        await listStoreProducts(db, {
          limit: 24,
          locale: "es",
          page: 1,
          q,
          sort: "updated",
          storeId,
        })
      ).items.map((item) => item.id);

    expect(await search(`NANDU ${tag}`)).toEqual([rhea.id]);
    expect(await search(`necklace ${tag}`)).toEqual([rhea.id]);
    expect(await search(`collar ñandú ${tag}`)).toEqual([rhea.id]);
  });

  test("takes a search's wildcards literally", async () => {
    const { create, storeId, tag } = await setup();
    const literal = await create({
      translations: [spanish(`50%_off ${tag}`)],
    });
    // What `50%_off` matches as a pattern: 50, anything, one character, off.
    await create({ translations: [spanish(`50xyoff ${tag}`)] });
    await create({ translations: [spanish(`50 off ${tag}`)] });
    // One escape lost at a time: `%` as anything finds the first, `_` as
    // any one character the second.
    await create({ translations: [spanish(`50xy_off ${tag}`)] });
    await create({ translations: [spanish(`50%Xoff ${tag}`)] });

    const { items, total } = await listStoreProducts(db, {
      limit: 24,
      locale: "es",
      page: 1,
      q: `50%_off ${tag}`,
      sort: "updated",
      storeId,
    });

    expect(items.map((item) => item.id)).toEqual([literal.id]);
    expect(total).toBe(1);
  });

  test("lists every article of the search, drafts too, the latest change first", async () => {
    const { listed } = await setupCatalog();

    expect(await listed()).toEqual(["A", "B", "C"]);
  });

  test.each([
    ["drafts", { status: "draft" }, ["B"]],
    ["published", { status: "published" }, ["A", "C"]],
    ["unavailable", { availability: "unavailable" }, ["B"]],
    ["available", { availability: "available" }, ["A", "C"]],
    [
      "published and available",
      { availability: "available", status: "published" },
      ["A", "C"],
    ],
    [
      "drafts and available",
      { availability: "available", status: "draft" },
      [],
    ],
  ] as const)("narrows to %s", async (_case, options, expected) => {
    const { listed } = await setupCatalog();

    expect(await listed(options)).toEqual(expected);
  });

  test("narrows to a category, to several, and to a group with every category in it", async () => {
    const { earrings, group, listed, rings, tag } = await setupCatalog();

    expect(await listed({ categories: [rings.slug] })).toEqual(["A"]);
    expect(await listed({ categories: [rings.slug, earrings.slug] })).toEqual([
      "A",
      "B",
    ]);
    expect(await listed({ categories: [group.slug] })).toEqual(["A", "B"]);
    expect(await listed({ categories: [`cadenas-${tag}`] })).toEqual(["C"]);
  });

  test("ignores a category the store does not have, alone or beside one it has", async () => {
    const { listed, rings, tag } = await setupCatalog();

    expect(await listed({ categories: [`relojes-${tag}`] })).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(
      await listed({ categories: [`relojes-${tag}`, rings.slug] })
    ).toEqual(["A"]);
  });

  test("a filter's values are alternatives and different filters narrow each other", async () => {
    const { color, listed, size } = await setupCatalog();

    expect(
      await listed({ filters: [{ attribute: color.slug, values: ["dorado"] }] })
    ).toEqual(["A", "C"]);
    expect(
      await listed({
        filters: [{ attribute: color.slug, values: ["dorado", "violeta"] }],
      })
    ).toEqual(["A", "B", "C"]);
    expect(
      await listed({
        filters: [
          { attribute: color.slug, values: ["dorado"] },
          { attribute: size.slug, values: ["s"] },
        ],
      })
    ).toEqual(["C"]);
  });

  test("combines a category, a filter, a status and the search", async () => {
    const {
      category: chains,
      color,
      create,
      group,
      listed,
      rings,
      tag,
    } = await setupCatalog();
    // Drafts that only one of the four leaves out, each read as "?": outside
    // the group, without the search's tag, of another color.
    await create({
      attributeValueIds: [color.idOf("violeta")],
      categoryId: chains.id,
      translations: [spanish(`Fuera del grupo ${tag}`)],
    });
    await create({
      attributeValueIds: [color.idOf("violeta")],
      categoryId: rings.id,
      translations: [spanish("Sin la etiqueta")],
    });
    await create({
      attributeValueIds: [color.idOf("dorado")],
      categoryId: rings.id,
      translations: [spanish(`Otro color ${tag}`)],
    });

    expect(
      await listed({
        categories: [group.slug],
        filters: [{ attribute: color.slug, values: ["violeta"] }],
        status: "draft",
      })
    ).toEqual(["B"]);
    expect(
      await listed({
        categories: [group.slug],
        filters: [{ attribute: color.slug, values: ["violeta"] }],
        status: "published",
      })
    ).toEqual([]);
  });

  test("pages through the matches: the count, the pages, the last and one past it", async () => {
    const { list, listed } = await setupCatalog();

    await expect(list({ limit: 2 })).resolves.toMatchObject({
      limit: 2,
      page: 1,
      pageCount: 2,
      total: 3,
      totalCapped: false,
    });
    expect(await listed({ limit: 2 })).toEqual(["A", "B"]);
    expect(await listed({ limit: 2, page: 2 })).toEqual(["C"]);
    await expect(list({ limit: 2, page: 3 })).resolves.toMatchObject({
      items: [],
      pageCount: 2,
      total: 3,
    });
    await expect(list({ limit: 3 })).resolves.toMatchObject({ pageCount: 1 });
    await expect(
      list({ status: "draft", availability: "available" })
    ).resolves.toMatchObject({
      items: [],
      pageCount: 0,
      total: 0,
    });
  });

  test("breaks a tie by the id, so pages of unchanged matches never repeat or skip an article", async () => {
    const { create, storeId, tag } = await setup();
    const ids: number[] = [];

    for (const letter of ["a", "b", "c", "d", "e"]) {
      ids.push(
        (await create({ translations: [spanish(`${letter} ${tag}`)] })).id
      );
    }

    await changedAt(ids.map((id) => [id, "2999-01-01T00:00:00.000Z"]));
    const pageOf = async (page: number) =>
      (
        await listStoreProducts(db, {
          limit: 2,
          locale: "es",
          page,
          q: tag,
          sort: "updated",
          storeId,
        })
      ).items.map((item) => item.id);

    const newestFirst = [...ids];
    newestFirst.sort((x, y) => y - x);

    expect([
      ...(await pageOf(1)),
      ...(await pageOf(2)),
      ...(await pageOf(3)),
    ]).toEqual(newestFirst);
  });
});

describe("the admin's list order (FER-019)", () => {
  /**
   * Three articles of this test, found by a filter value of their own: T1
   * "Ábaco", $300, in "Cadenas", published; T2 "banana" (English
   * "Aardvark", which sorts before "Ábaco" where "banana" sorts after),
   * $100, in "Anillos" ("Rings"), a draft; T3 a blank draft without a price
   * or a category. Changed T1, T3, T2, the latest first.
   */
  async function setupOrder() {
    const { category: chains, create, storeId, tag } = await setup();
    const rings = await insertCategory({
      nameEn: "Rings",
      nameEs: "Anillos",
      slug: `anillos-${tag}`,
      storeId,
    });
    const own = await insertFilter(`propio-${tag}`, ["si"], storeId);
    const mine = [own.idOf("si")];
    // `setup`'s category is "Cadenas <tag>", which sorts after "Anillos".
    const t1 = await create({
      attributeValueIds: mine,
      categoryId: chains.id,
      priceAmount: 30_000,
      translations: [spanish("Ábaco")],
    });
    const t2 = await create({
      attributeValueIds: mine,
      categoryId: rings.id,
      priceAmount: 10_000,
      translations: [spanish("banana"), english("Aardvark")],
    });
    const t3 = await create({
      attributeValueIds: mine,
      categoryId: null,
      images: [],
      priceAmount: null,
      translations: [spanish("")],
    });
    await publishProduct(db, { id: t1.id, storeId });
    await changedAt([
      [t1.id, "2999-01-03T00:00:00.000Z"],
      [t2.id, "2999-01-01T00:00:00.000Z"],
      [t3.id, "2999-01-02T00:00:00.000Z"],
    ]);
    const names = new Map([
      [t1.id, "T1"],
      [t2.id, "T2"],
      [t3.id, "T3"],
    ]);
    const listed = async (
      options: Partial<Parameters<typeof listStoreProducts>[1]> = {}
    ) =>
      (
        await listStoreProducts(db, {
          filters: [{ attribute: own.slug, values: ["si"] }],
          limit: 24,
          locale: "es",
          page: 1,
          sort: "updated",
          storeId,
          ...options,
        })
      ).items.map((item) => names.get(item.id) ?? "?");
    // Both drafts tie on the status: the id decides, the same way.
    const drafts = t2.id < t3.id ? ["T2", "T3"] : ["T3", "T2"];

    return { drafts, listed };
  }

  test.each([
    ["updated", "desc", "es", ["T1", "T3", "T2"]],
    ["updated", "asc", "es", ["T2", "T3", "T1"]],
    ["title", "asc", "es", ["T1", "T2", "T3"]],
    ["title", "desc", "es", ["T2", "T1", "T3"]],
    ["title", "asc", "en", ["T2", "T1", "T3"]],
    ["price", "asc", "es", ["T2", "T1", "T3"]],
    ["price", "desc", "es", ["T1", "T2", "T3"]],
    ["category", "asc", "es", ["T2", "T1", "T3"]],
    ["category", "desc", "es", ["T1", "T2", "T3"]],
    // In English "Rings" sorts after "Cadenas", which has no English name.
    ["category", "asc", "en", ["T1", "T2", "T3"]],
    ["category", "desc", "en", ["T2", "T1", "T3"]],
  ] as const)(
    "sorts by %s %s in %s, an article without the key last",
    async (sort, dir, locale, expected) => {
      const { listed } = await setupOrder();

      expect(await listed({ dir, locale, sort })).toEqual(expected);
    }
  );

  test("sorts the title in English by the English one, else the Spanish one", async () => {
    const { listed } = await setupOrder();

    // T2 is "Aardvark" in English: before "Ábaco", where "banana" is after.
    expect(await listed({ dir: "desc", locale: "en", sort: "title" })).toEqual([
      "T1",
      "T2",
      "T3",
    ]);
  });

  test("a title of whitespace alone is blank to the sort, as to the row: the next language's decides", async () => {
    const { create, storeId, tag } = await setup();
    const own = await insertFilter(`propio-${tag}`, ["si"], storeId);
    // "Zorro" in English is a tab: the row shows "Zorro", and so it sorts.
    const fox = await create({
      attributeValueIds: [own.idOf("si")],
      translations: [spanish("Zorro"), english("\t\n")],
    });
    const donkey = await create({
      attributeValueIds: [own.idOf("si")],
      translations: [spanish("Burro"), english("Donkey")],
    });

    const page = await listStoreProducts(db, {
      filters: [{ attribute: own.slug, values: ["si"] }],
      limit: 24,
      locale: "en",
      page: 1,
      sort: "title",
      storeId,
    });

    expect(
      page.items.map((item) => [item.id, item.title, item.titleLang])
    ).toEqual([
      [donkey.id, "Donkey", "en"],
      [fox.id, "Zorro", "es"],
    ]);
  });

  test.each([
    ["asc", "drafts first"],
    ["desc", "published first"],
  ] as const)(
    "sorts by status %s, %s, ties broken by the id",
    async (dir, _order) => {
      const { drafts, listed } = await setupOrder();
      const reversed = [...drafts];
      reversed.reverse();

      expect(await listed({ dir, sort: "status" })).toEqual(
        dir === "asc" ? [...drafts, "T1"] : ["T1", ...reversed]
      );
    }
  );

  test("sorts before it pages, and narrows before it sorts", async () => {
    const { listed } = await setupOrder();

    expect(await listed({ limit: 1, page: 2, sort: "price" })).toEqual(["T1"]);
    expect(
      await listed({ limit: 1, page: 1, sort: "price", status: "published" })
    ).toEqual(["T1"]);
    expect(await listed({ limit: 2, page: 2, sort: "title" })).toEqual(["T3"]);
  });
});

describe("store-scoped writes", () => {
  test("slugs come from the Spanish title, stay unique in the store, and stop following it once published", async () => {
    const { create, save, storeId, tag } = await setup();
    const title = `Collar Ñandú ${tag}`;
    const first = await create({ translations: [spanish(title)] });
    const images = [upload()];
    const second = await create({ images, translations: [spanish(title)] });

    expect([first.slug, second.slug]).toEqual([
      `collar-nandu-${tag}`,
      `collar-nandu-${tag}-2`,
    ]);

    const rename = async (renamed: string) =>
      await save(second.id, { images, translations: [spanish(renamed)] });

    expect((await rename(`Pulsera ${tag}`)).slug).toBe(`pulsera-${tag}`);

    await publishProduct(db, { id: second.id, storeId });
    expect((await rename(`Otra cosa ${tag}`)).slug).toBe(`pulsera-${tag}`);
  });

  test("publishing is refused until it has an image, a category and a price, and says what is missing", async () => {
    const { create, storeId } = await setup();
    const bare = await create({
      categoryId: null,
      images: [],
      priceAmount: null,
    });

    await expect(
      publishProduct(db, { id: bare.id, storeId })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "The article cannot be published yet. Missing: image, category, price",
    });
  });

  test("the first publication stamps the date once; unpublishing and publishing again keep it", async () => {
    const { create, storeId } = await setup();
    const article = await create();
    const dateOf = async () =>
      (await db.query.product.findFirst({ where: eq(product.id, article.id) }))
        ?.publishedAt;
    expect(await dateOf()).toBeNull();
    await publishProduct(db, { id: article.id, storeId });
    expect(await dateOf()).toBeInstanceOf(Date);

    // A date no write of this test could stamp, so keeping it is visible.
    const firstPublished = new Date("2020-03-04T05:06:07.890Z");
    await db
      .update(product)
      .set({ publishedAt: firstPublished })
      .where(eq(product.id, article.id));

    await unpublishProduct(db, { id: article.id, storeId });
    expect(await dateOf()).toEqual(firstPublished);
    await publishProduct(db, { id: article.id, storeId });
    expect(await dateOf()).toEqual(firstPublished);
  });

  test("a category the store no longer has cannot be attached, through the service or the database", async () => {
    const { create, storeId, tag } = await setup();
    const [gone] = await db
      .insert(category)
      .values({ position: 1, slug: `viejas-${tag}`, storeId })
      .returning();

    if (!gone) {
      throw new Error("no category");
    }

    await db.delete(category).where(eq(category.id, gone.id));

    await expect(create({ categoryId: gone.id })).rejects.toMatchObject({
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
    const { category: own, create } = await setup();
    await create();

    await expect(
      db.delete(category).where(eq(category.id, own.id))
    ).rejects.toMatchObject({
      cause: { constraint: "product_store_category_fk" },
    });
  });

  test("deleting an article answers its images' addresses and leaves no image row", async () => {
    const { create, photosOf, storeId } = await setup();
    const [a, b] = [upload(), upload()];
    const article = await create({ images: [a, b] });

    const deleted = await deleteProduct(db, { id: article.id, storeId });

    expect(deleted.id).toBe(article.id);
    // In no order: the article's images are read only to delete their files.
    expect(new Set(deleted.imageUrls)).toEqual(new Set([a.url, b.url]));
    expect(deleted.imageUrls).toHaveLength(2);
    await expect(photosOf(article.id)).resolves.toEqual([]);
  });

  test("an article the store no longer has is NOT_FOUND for every write", async () => {
    const { create, save, storeId } = await setup();
    const article = await create();
    await deleteProduct(db, { id: article.id, storeId });
    const scope = { id: article.id, storeId };
    const notFound = { code: "NOT_FOUND", message: "Article not found" };

    await expect(save(article.id)).rejects.toMatchObject(notFound);
    await expect(publishProduct(db, scope)).rejects.toMatchObject(notFound);
    await expect(unpublishProduct(db, scope)).rejects.toMatchObject(notFound);
    await expect(
      setProductAvailability(db, { ...scope, isAvailable: false })
    ).rejects.toMatchObject(notFound);
    await expect(deleteProduct(db, scope)).rejects.toMatchObject(notFound);
  });

  test("an edit that takes a published article's price away is refused", async () => {
    const { create, save, storeId } = await setup();
    const images = [upload()];
    const article = await create({ images });
    await publishProduct(db, { id: article.id, storeId });

    await expect(
      save(article.id, { images, priceAmount: null })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: price",
    });
  });
});

describe("slug allocation under two writers", () => {
  test("a second article with the same title waits for the first one's slug and takes the next", async () => {
    const { storeId, tag } = await setup();
    const held = deferred();
    const allocated = deferred();
    const firstPid = deferred<number>();
    const secondPid = deferred<number>();
    const draft = async (tx: DatabaseClient) => {
      const row = await createProduct(tx, {
        blobStore: null,
        storeId,
        values: articleValues({
          images: [],
          translations: [spanish(`Collar Gemelo ${tag}`)],
        }),
      });
      created.productIds.push(row.id);

      return row;
    };

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const row = await draft(tx);
      allocated.resolve(undefined);
      await held.promise;

      return row;
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled([first])
    );
    await readyOrFailed(allocated.promise, first);
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await draft(tx);
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled([second])
    );

    await waitUntilAdvisoryBlocked(
      db,
      await readyOrFailed(secondPid.promise, second),
      await firstPid.promise
    );
    held.resolve(undefined);

    const [a, b] = await Promise.all([first, second]);
    expect([a.slug, b.slug]).toEqual([
      `collar-gemelo-${tag}`,
      `collar-gemelo-${tag}-2`,
    ]);
  });
});

describe("two saves of the same article (FER-017 autosave)", () => {
  /**
   * The first save adds photo X and holds its transaction open; the second,
   * sent while it runs (an autosave overlapping the next), adds X again and
   * Y. Without the row lock the second would read the photos before X was
   * committed and insert X a second time.
   */
  test("the second waits for the first's row lock, then keeps its photo once and adds its own", async () => {
    const { create, photosOf, save, tag } = await setup();
    const a = upload();
    const [x, y] = [upload(), upload()];
    const article = await create({ images: [a] });
    const held = deferred();
    const saved = deferred();
    const firstPid = deferred<number>();
    const secondPid = deferred<number>();

    const first = db.transaction(async (tx) => {
      firstPid.resolve(await backendPid(tx));
      const result = await save(
        article.id,
        { images: [a, x], translations: [spanish(`Primero ${tag}`)] },
        tx
      );
      saved.resolve(undefined);
      await held.promise;

      return result;
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled([first])
    );
    await readyOrFailed(saved.promise, first);
    const second = db.transaction(async (tx) => {
      secondPid.resolve(await backendPid(tx));

      return await save(
        article.id,
        { images: [x, a, y], translations: [spanish(`Segundo ${tag}`)] },
        tx
      );
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled([second])
    );

    await waitUntilBlockedBy(
      db,
      await readyOrFailed(secondPid.promise, second),
      await firstPid.promise
    );
    held.resolve(undefined);

    await expect(first).resolves.toMatchObject({ discardedImageUrls: [] });
    await expect(second).resolves.toMatchObject({
      discardedImageUrls: [],
      slug: `segundo-${tag}`,
    });
    expect((await photosOf(article.id)).map((photo) => photo.url)).toEqual([
      x.url,
      a.url,
      y.url,
    ]);
  });

  test("control: a save after the other committed waits on nothing and ends the same", async () => {
    const { create, photosOf, save, tag } = await setup();
    const a = upload();
    const [x, y] = [upload(), upload()];
    const article = await create({ images: [a] });

    await save(article.id, {
      images: [a, x],
      translations: [spanish(`Primero ${tag}`)],
    });
    await save(article.id, {
      images: [x, a, y],
      translations: [spanish(`Segundo ${tag}`)],
    });

    expect((await photosOf(article.id)).map((photo) => photo.url)).toEqual([
      x.url,
      a.url,
      y.url,
    ]);
  });
});

describe("an edit and a publication of the same article", () => {
  test("the publication waits for the edit's row lock, then refuses the price the edit took away", async () => {
    const { create, save, storeId } = await setup();
    const images = [upload()];
    const article = await create({ images });
    const held = deferred();
    const locked = deferred();
    const editPid = deferred<number>();
    const publishPid = deferred<number>();

    // The edit clears a field publishing needs: only a publication that
    // waited for it (the row lock) reads the cleared price and refuses.
    const edit = db.transaction(async (tx) => {
      editPid.resolve(await backendPid(tx));
      const updated = await save(article.id, { images, priceAmount: null }, tx);
      locked.resolve(undefined);
      await held.promise;

      return updated;
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled([edit])
    );
    await readyOrFailed(locked.promise, edit);
    const publication = db.transaction(async (tx) => {
      publishPid.resolve(await backendPid(tx));

      return await publishProduct(tx, { id: article.id, storeId });
    });
    releaseOnTeardown(
      () => {
        held.resolve(undefined);
      },
      async () => await Promise.allSettled([publication])
    );

    await waitUntilBlockedBy(
      db,
      await readyOrFailed(publishPid.promise, publication),
      await editPid.promise
    );
    held.resolve(undefined);

    await expect(edit).resolves.toMatchObject({ id: article.id });
    await expect(publication).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: price",
    });
  });

  test("control: a publication of a ready article waits on nothing", async () => {
    const { create, storeId, tag } = await setup();
    const article = await create({ translations: [spanish(`Cadena ${tag}`)] });

    await expect(
      publishProduct(db, { id: article.id, storeId })
    ).resolves.toEqual({
      id: article.id,
      slug: `cadena-${tag}`,
      status: "published",
    });
  });
});
