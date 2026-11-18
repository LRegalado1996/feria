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

  const create = async (overrides: Partial<Values> = {}) => {
    const article = await createProduct(db, {
      blobStore: BLOB_STORE,
      storeId,
      values: articleValues({ categoryId: row.id, ...overrides }),
    });
    created.productIds.push(article.id);

    return article;
  };
  const save = async (
    id: number,
    overrides: Partial<Values> = {},
    client: DatabaseClient = db
  ) =>
    await updateProduct(client, {
      blobStore: BLOB_STORE,
      storeId,
      values: { ...articleValues({ categoryId: row.id, ...overrides }), id },
    });
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
    await expect(
      save(article.id, { attributeValueIds: [silver, purple], images })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Filter value not found",
    });
    expect(await carried()).toEqual([silver]);
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

  test("list pages through drafts and published articles, newest change first, ties broken by id, never repeating one", async () => {
    const { create, storeId, tag } = await setup();
    const blank = await create({ images: [], translations: [spanish("")] });
    const older = await create({ translations: [spanish(`Viejo ${tag}`)] });
    const tied = await create({ translations: [spanish(`Empate ${tag}`)] });
    await publishProduct(db, { id: tied.id, storeId });
    // Later than anything else in the store, so these lead the list; two
    // at the same instant, which only the id orders.
    const later = new Date("2999-01-01T00:00:00.000Z");
    await db
      .update(product)
      .set({ updatedAt: later })
      .where(inArray(product.id, [blank.id, tied.id]));
    await db
      .update(product)
      .set({ updatedAt: new Date("2998-01-01T00:00:00.000Z") })
      .where(eq(product.id, older.id));

    const first = await listStoreProducts(db, { limit: 2, storeId });
    const second = await listStoreProducts(db, {
      cursor: first.nextCursor ?? undefined,
      limit: 2,
      storeId,
    });

    const ids = blank.id > tied.id ? [blank.id, tied.id] : [tied.id, blank.id];
    expect(first.items.map((item) => item.id)).toEqual(ids);
    expect(first.nextCursor).toEqual({
      id: ids[1],
      updatedAt: "2999-01-01T00:00:00.000Z",
    });
    expect(second.items[0]?.id).toBe(older.id);
    expect(first.items.find((item) => item.id === blank.id)).toMatchObject({
      cover: null,
      status: "draft",
      title: null,
    });
    expect(first.items.find((item) => item.id === tied.id)).toMatchObject({
      status: "published",
      title: `Empate ${tag}`,
      titleLang: "es",
    });
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

  test("the first publication stamps the date once; unpublishing keeps the date", async () => {
    const { create, storeId } = await setup();
    const article = await create();
    const dateOf = async () =>
      (await db.query.product.findFirst({ where: eq(product.id, article.id) }))
        ?.publishedAt;
    await publishProduct(db, { id: article.id, storeId });
    const firstDate = await dateOf();

    await unpublishProduct(db, { id: article.id, storeId });
    await publishProduct(db, { id: article.id, storeId });

    expect(firstDate).toBeInstanceOf(Date);
    expect(await dateOf()).toEqual(firstDate);
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
      await secondPid.promise,
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
      await secondPid.promise,
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
      await publishPid.promise,
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
