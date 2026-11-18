import { describe, expect, test, vi } from "vitest";

import type { Locale } from "@/lib/i18n/config";
import {
  product,
  productImage,
  productTranslation,
  store,
} from "@/server/db/schema";
import { createMockDatabase } from "@/server/test/context";
import {
  renderOrderBy,
  renderQuery,
  renderSql,
} from "@/server/test/render-sql";

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

// Its own queries are `attribute.test.ts`'s: here only that every save hands
// it the article and the values, inside the same transaction.
const { replaceProductAttributeValues } = vi.hoisted(() => ({
  replaceProductAttributeValues: vi.fn(async () => {
    await Promise.resolve();
  }),
}));

vi.mock("@/server/services/attribute", () => ({
  replaceProductAttributeValues,
}));

const STORE_ID = 3;
const PUBLISHED_AT = new Date("2026-11-10T12:00:00.123Z");
const UPDATED_AT = new Date("2026-11-17T09:30:00.456Z");
const HOST = "store9.public.blob.vercel-storage.com";
const BLOB_STORE = { host: HOST, namespace: "qa", token: "secret" } as const;
const UUID_A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const UUID_C = "16fd2706-8baf-433b-82eb-8c7fada847da";

const CATEGORY_SQL = '("category"."id" = $1 and "category"."storeId" = $2)';
const ARTICLE_SQL = '("product"."id" = $1 and "product"."storeId" = $2)';
const IMAGES_OF_SQL = '"product_image"."productId" = $1';

/** An upload of this deployment for articles. */
function upload(id: string, folder = "product") {
  return `https://${HOST}/qa/${folder}/${id}.webp`;
}

function translationInput(
  overrides: Partial<{
    description: string;
    locale: Locale;
    seoDescription: string | null;
    seoTitle: string | null;
    title: string;
  }> = {}
) {
  return {
    description: "Hecho a mano",
    locale: "es" as const,
    seoDescription: null,
    seoTitle: null,
    title: "Collar Dorado",
    ...overrides,
  };
}

function imageInput(url: string) {
  return { height: 1600, url, width: 1200 };
}

function productValues(
  overrides: Partial<{
    attributeValueIds: number[];
    categoryId: number | null;
    images: ReturnType<typeof imageInput>[];
    isAvailable: boolean;
    priceAmount: number | null;
    translations: ReturnType<typeof translationInput>[];
  }> = {}
) {
  return {
    attributeValueIds: [21],
    categoryId: 9,
    images: [imageInput(upload(UUID_A))],
    isAvailable: true,
    priceAmount: 1500,
    translations: [translationInput()],
    ...overrides,
  };
}

function lockedRow(
  overrides: Partial<{
    categoryId: number | null;
    priceAmount: number | null;
    publishedAt: Date | null;
    status: "draft" | "published";
  }> = {}
) {
  return {
    categoryId: 9,
    id: 7,
    priceAmount: 1500,
    publishedAt: null,
    slug: "collar-viejo",
    status: "draft" as const,
    ...overrides,
  };
}

function savedRow(
  overrides: Partial<{ id: number; slug: string; status: string }> = {}
) {
  return {
    id: 7,
    slug: "collar-dorado",
    status: "draft",
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

/**
 * The mock database answering by the SQL each read sends:
 * - `category`: whether the category is the store's (share-locked);
 * - `locked`: the article the write locks, or none;
 * - `stored`: the photos the article holds, in their order;
 * - `taken`: the slugs the store already uses;
 * - `imageTotal`: how many photos publishing counts.
 */
function setup({
  category = true,
  imageTotal = 0,
  locked = [lockedRow()],
  stored = [],
  taken = [],
}: {
  category?: boolean;
  imageTotal?: number;
  locked?: ReturnType<typeof lockedRow>[];
  stored?: { id: number; position: number; url: string }[];
  taken?: string[];
} = {}) {
  const db = createMockDatabase();
  const lastWhere = () =>
    renderSql(db.$["select.where"].mock.calls.at(-1)?.[0]);

  db.$["select.for"].mockImplementation(async () => {
    const text = lastWhere();

    if (text === CATEGORY_SQL) {
      return await Promise.resolve(category ? [{ id: 9 }] : []);
    }

    return await Promise.resolve(text === ARTICLE_SQL ? locked : []);
  });
  db.$["select.where"].mockImplementation(async (where: unknown) => {
    const text = renderSql(where);

    if (text === IMAGES_OF_SQL) {
      return await Promise.resolve([{ total: imageTotal }]);
    }

    return await Promise.resolve(
      text.startsWith('("product"."storeId" = $1 and "product"."slug" like')
        ? taken.map((slug) => ({ slug }))
        : []
    );
  });
  db.$["select.orderBy"].mockImplementation(async () =>
    lastWhere() === IMAGES_OF_SQL
      ? await Promise.resolve(stored)
      : await Promise.resolve([])
  );

  /** Every `where` the plain selects sent, as SQL and parameters. */
  const selectWheres = () =>
    db.$["select.where"].mock.calls.map(([where]) => renderQuery(where));
  /** The tables written, in the order they were, with the operation. */
  const writes = () => {
    const all = (["insert", "update", "delete"] as const).flatMap((op) =>
      db.$[op].mock.calls.map(([table], index) => ({
        at: db.$[op].mock.invocationCallOrder[index] ?? 0,
        op,
        table,
      }))
    );
    all.sort((a, b) => a.at - b.at);

    return all.map(({ op, table }) => [op, table]);
  };
  /** What the nth insert, update or delete of `table` was handed. */
  const handed = (
    op: "delete" | "insert" | "update",
    table: unknown,
    step: string
  ) =>
    db.$[op].mock.calls.flatMap(([written], index) =>
      written === table ? [db.$[`${op}.${step}`]?.mock.calls[index]?.[0]] : []
    );

  return { db, handed, selectWheres, writes };
}

type MockDb = ReturnType<typeof setup>["db"];

describe("createProduct", () => {
  async function create(
    db: MockDb,
    values = productValues(),
    blobStore: typeof BLOB_STORE | null = BLOB_STORE
  ) {
    return await createProduct(db as never, {
      blobStore,
      storeId: STORE_ID,
      values,
    });
  }

  test.each([
    [
      "another store's upload",
      `https://other.example.com/qa/product/${UUID_A}.webp`,
    ],
    ["a cover's upload", upload(UUID_A, "cover")],
    ["a path of the site no article holds", "/seed/ring-1.jpg"],
  ])(
    "refuses a photo that is %s before reading or writing anything",
    async (_case, url) => {
      const { db } = setup();

      await expect(
        create(db, productValues({ images: [imageInput(url)] }))
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "An article photo must be one uploaded to this store",
      });
      expect(db.$.select).not.toHaveBeenCalled();
      expect(db.$.insert).not.toHaveBeenCalled();
    }
  );

  test("refuses every new photo where the deployment has no Blob store", async () => {
    const { db } = setup();

    await expect(create(db, productValues(), null)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "An article photo must be one uploaded to this store",
    });
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("refuses a category of another store before inserting anything", async () => {
    const { db, selectWheres } = setup({ category: false });

    await expect(create(db)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Category not found",
    });
    expect(selectWheres()).toEqual([
      { params: [9, STORE_ID], sql: CATEGORY_SQL },
    ]);
    // Shared: the category cannot be deleted under the new article.
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("share");
    expect(db.$.execute).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("inserts a draft under the store's slug lock, then its texts, photos and filter values", async () => {
    const { db, handed, selectWheres, writes } = setup({
      taken: ["collar-dorado", "collar-dorado-2"],
    });
    db.$["insert.returning"].mockResolvedValue([
      savedRow({ slug: "collar-dorado-3" }),
    ]);
    const english = translationInput({
      description: "Handmade",
      locale: "en",
      seoDescription: "Gold",
      seoTitle: "Necklace",
      title: "Gold Necklace",
    });

    await expect(
      create(
        db,
        productValues({
          images: [imageInput(upload(UUID_A)), imageInput(upload(UUID_B))],
          translations: [translationInput(), english],
        })
      )
    ).resolves.toEqual({
      id: 7,
      publishGaps: [],
      slug: "collar-dorado-3",
      status: "draft",
      updatedAt: UPDATED_AT,
    });
    expect(renderQuery(db.$.execute.mock.calls[0]?.[0])).toEqual({
      params: [`product.slug:${STORE_ID}`],
      sql: "select pg_advisory_xact_lock(hashtext($1))",
    });
    expect(selectWheres()[1]).toEqual({
      params: [STORE_ID, "collar-dorado%"],
      sql: '("product"."storeId" = $1 and "product"."slug" like $2)',
    });
    // A new article has no photo yet: none is read, moved or deleted.
    expect(db.$["select.orderBy"]).not.toHaveBeenCalled();
    expect(writes()).toEqual([
      ["insert", product],
      ["delete", productTranslation],
      ["insert", productTranslation],
      ["insert", productImage],
    ]);
    // No position: the column's default puts it last in the store's order.
    expect(handed("insert", product, "values")).toEqual([
      {
        categoryId: 9,
        isAvailable: true,
        priceAmount: 1500,
        slug: "collar-dorado-3",
        status: "draft",
        storeId: STORE_ID,
      },
    ]);
    expect(handed("insert", productTranslation, "values")).toEqual([
      [
        { ...translationInput(), productId: 7 },
        { ...english, productId: 7 },
      ],
    ]);
    expect(handed("insert", productImage, "values")).toEqual([
      [
        { ...imageInput(upload(UUID_A)), position: 0, productId: 7 },
        { ...imageInput(upload(UUID_B)), position: 1, productId: 7 },
      ],
    ]);
    expect(replaceProductAttributeValues).toHaveBeenCalledExactlyOnceWith(db, {
      productId: 7,
      storeId: STORE_ID,
      valueIds: [21],
    });
  });

  test("names a blank draft by the fallback, checks no category, and says all it lacks", async () => {
    const { db, handed, selectWheres } = setup({ taken: ["articulo"] });
    db.$["insert.returning"].mockResolvedValue([
      savedRow({ slug: "articulo-2" }),
    ]);

    await expect(
      create(
        db,
        productValues({
          attributeValueIds: [],
          categoryId: null,
          priceAmount: null,
          translations: [translationInput({ description: "", title: "" })],
        })
      )
    ).resolves.toMatchObject({
      publishGaps: ["category", "price", "spanishTitle"],
      slug: "articulo-2",
    });
    expect(selectWheres()).toEqual([
      {
        params: [STORE_ID, "articulo%"],
        sql: '("product"."storeId" = $1 and "product"."slug" like $2)',
      },
    ]);
    expect(handed("insert", product, "values")).toEqual([
      expect.objectContaining({ categoryId: null, slug: "articulo-2" }),
    ]);
    expect(handed("insert", productTranslation, "values")).toEqual([
      [
        {
          description: "",
          locale: "es",
          productId: 7,
          seoDescription: null,
          seoTitle: null,
          title: "",
        },
      ],
    ]);
  });

  test("inserts no photo row for an article created without one", async () => {
    const { db, writes } = setup();
    db.$["insert.returning"].mockResolvedValue([savedRow()]);

    await expect(
      create(db, productValues({ images: [] }))
    ).resolves.toMatchObject({ publishGaps: ["image"] });
    expect(writes()).not.toContainEqual(["insert", productImage]);
  });

  test("looks for taken slugs by the prefix a suffixed one keeps, not the whole base", async () => {
    const base = "a".repeat(80);
    const { db, handed, selectWheres } = setup({
      taken: [base, `${"a".repeat(78)}-2`],
    });
    db.$["insert.returning"].mockResolvedValue([savedRow()]);

    await create(
      db,
      productValues({ translations: [translationInput({ title: base })] })
    );

    expect(selectWheres()[1]?.params).toEqual([STORE_ID, `${"a".repeat(74)}%`]);
    expect(handed("insert", product, "values")).toEqual([
      expect.objectContaining({ slug: `${"a".repeat(78)}-3` }),
    ]);
  });

  test("fails loudly when the insert returns no row, writing nothing else", async () => {
    const { db, writes } = setup();

    await expect(create(db)).rejects.toThrow(
      "Inserting an article returned no row"
    );
    expect(writes()).toEqual([["insert", product]]);
    expect(replaceProductAttributeValues).not.toHaveBeenCalled();
  });
});

describe("updateProduct", () => {
  async function update(
    db: MockDb,
    values = productValues(),
    blobStore: typeof BLOB_STORE | null = BLOB_STORE
  ) {
    return await updateProduct(db as never, {
      blobStore,
      storeId: STORE_ID,
      values: { id: 7, ...values },
    });
  }

  test("answers NOT_FOUND when the store has no such article, writing nothing", async () => {
    const { db, selectWheres } = setup({ locked: [] });

    await expect(update(db)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });
    // The category under a share lock first, then the article: the order a
    // category's deletion takes them in, so the two never deadlock.
    expect(db.$["select.for"].mock.calls).toEqual([["share"], ["update"]]);
    expect(selectWheres()[1]).toEqual({
      params: [7, STORE_ID],
      sql: ARTICLE_SQL,
    });
    expect(db.$.update).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
  });

  test("refuses a category the store does not have before it locks the article", async () => {
    const { db } = setup({ category: false });

    await expect(update(db)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Category not found",
    });
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("share");
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("reads the photos the locked article holds, in their order", async () => {
    const { db } = setup({
      stored: [{ id: 1, position: 0, url: upload(UUID_A) }],
    });
    db.$["update.returning"].mockResolvedValue([savedRow()]);

    await update(db);

    expect(db.$["select.from"]).toHaveBeenNthCalledWith(3, productImage);
    expect(renderOrderBy(db.$["select.orderBy"].mock.calls[0])).toBe(
      '"product_image"."position" asc, "product_image"."id" asc'
    );
    // Read once the article is locked: no save can change them meanwhile.
    expect(
      db.$["select.for"].mock.invocationCallOrder[1] ?? Infinity
    ).toBeLessThan(db.$["select.orderBy"].mock.invocationCallOrder[0] ?? 0);
  });

  test.each([
    [
      "another deployment's upload",
      `https://${HOST}/production/product/${UUID_C}.webp`,
    ],
    ["a cover's upload", upload(UUID_C, "cover")],
    ["a path of the site the article does not hold", "/seed/other.jpg"],
  ])("refuses a new photo that is %s, writing nothing", async (_case, url) => {
    const { db } = setup({
      stored: [{ id: 1, position: 0, url: "/seed/ring-1.jpg" }],
    });

    await expect(
      update(
        db,
        productValues({
          images: [imageInput("/seed/ring-1.jpg"), imageInput(url)],
        })
      )
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "An article photo must be one uploaded to this store",
    });
    expect(db.$.update).not.toHaveBeenCalled();
    expect(db.$.insert).not.toHaveBeenCalled();
    expect(db.$.delete).not.toHaveBeenCalled();
  });

  test("keeps a photo the article holds, moves it, adds the new one and deletes the one left out", async () => {
    const { db, handed } = setup({
      stored: [
        { id: 1, position: 0, url: "/seed/ring-1.jpg" },
        { id: 2, position: 1, url: upload(UUID_A) },
        { id: 3, position: 2, url: upload(UUID_B) },
      ],
    });
    db.$["update.returning"].mockResolvedValue([savedRow()]);

    // B becomes the main photo, the seed's stays second, A goes and C is new.
    await expect(
      update(
        db,
        productValues({
          images: [
            imageInput(upload(UUID_B)),
            imageInput("/seed/ring-1.jpg"),
            imageInput(upload(UUID_C)),
          ],
        })
      )
    ).resolves.toEqual({
      discardedImageUrls: [upload(UUID_A)],
      id: 7,
      publishGaps: [],
      slug: "collar-dorado",
      status: "draft",
      updatedAt: UPDATED_AT,
    });
    expect(
      handed("delete", productImage, "where").map((where) => renderQuery(where))
    ).toEqual([
      {
        params: [7, 2],
        sql: '("product_image"."productId" = $1 and "product_image"."id" in ($2))',
      },
    ]);
    const [moved] = handed("update", productImage, "set") as {
      position: unknown;
    }[];
    expect(renderQuery(moved?.position)).toEqual({
      params: [3, 0, 1, 1],
      sql: 'case "product_image"."id" when $1 then $2::int when $3 then $4::int end',
    });
    expect(
      handed("update", productImage, "where").map((where) => renderQuery(where))
    ).toEqual([
      {
        params: [7, 3, 1],
        sql: '("product_image"."productId" = $1 and "product_image"."id" in ($2, $3))',
      },
    ]);
    expect(handed("insert", productImage, "values")).toEqual([
      [{ ...imageInput(upload(UUID_C)), position: 2, productId: 7 }],
    ]);
  });

  test("saving the same photos in the same order touches no photo row", async () => {
    const { db, writes } = setup({
      stored: [
        { id: 1, position: 0, url: upload(UUID_A) },
        { id: 2, position: 1, url: upload(UUID_B) },
      ],
    });
    db.$["update.returning"].mockResolvedValue([savedRow()]);

    await expect(
      update(
        db,
        productValues({
          images: [imageInput(upload(UUID_A)), imageInput(upload(UUID_B))],
        })
      )
    ).resolves.toMatchObject({ discardedImageUrls: [] });
    expect(writes()).toEqual([
      ["update", product],
      ["delete", productTranslation],
      ["insert", productTranslation],
    ]);
  });

  test("keeps a photo the article holds where the deployment has no Blob store", async () => {
    const { db } = setup({
      stored: [{ id: 1, position: 0, url: upload(UUID_A) }],
    });
    db.$["update.returning"].mockResolvedValue([savedRow()]);

    await expect(update(db, productValues(), null)).resolves.toMatchObject({
      discardedImageUrls: [],
    });
  });

  test("deletes a second row of a held address without handing its file over", async () => {
    const { db, handed } = setup({
      stored: [
        { id: 1, position: 0, url: upload(UUID_A) },
        { id: 2, position: 1, url: upload(UUID_A) },
      ],
    });
    db.$["update.returning"].mockResolvedValue([savedRow()]);

    await expect(update(db)).resolves.toMatchObject({
      discardedImageUrls: [],
    });
    expect(
      handed("delete", productImage, "where").map(
        (where) => renderQuery(where).params
      )
    ).toEqual([[7, 2]]);
  });

  test("taking every photo off a draft deletes them all and says the image is missing", async () => {
    const { db } = setup({
      stored: [
        { id: 1, position: 0, url: upload(UUID_A) },
        { id: 2, position: 1, url: upload(UUID_B) },
      ],
    });
    db.$["update.returning"].mockResolvedValue([savedRow()]);

    await expect(
      update(db, productValues({ images: [] }))
    ).resolves.toMatchObject({
      discardedImageUrls: [upload(UUID_A), upload(UUID_B)],
      publishGaps: ["image"],
    });
  });

  test.each([
    ["its price", { priceAmount: null }, "price"],
    ["its category", { categoryId: null }, "category"],
    ["its last photo", { images: [] }, "image"],
    [
      "its Spanish title",
      { translations: [translationInput({ title: "" })] },
      "spanishTitle",
    ],
    [
      "its English title",
      {
        translations: [
          translationInput(),
          translationInput({ locale: "en", title: "" }),
        ],
      },
      "englishTitle",
    ],
  ])(
    "refuses to take %s off a published article, writing nothing",
    async (_case, overrides, gap) => {
      const { db } = setup({
        locked: [lockedRow({ publishedAt: PUBLISHED_AT, status: "published" })],
        stored: [{ id: 1, position: 0, url: upload(UUID_A) }],
      });

      await expect(update(db, productValues(overrides))).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: `The article cannot be published yet. Missing: ${gap}`,
      });
      expect(db.$.update).not.toHaveBeenCalled();
      expect(db.$.delete).not.toHaveBeenCalled();
      expect(db.$.insert).not.toHaveBeenCalled();
    }
  );

  test("saves a draft with gaps, and says what publishing it still needs", async () => {
    const { db } = setup();
    db.$["update.returning"].mockResolvedValue([savedRow()]);

    await expect(
      update(db, productValues({ images: [], priceAmount: null }))
    ).resolves.toMatchObject({ publishGaps: ["image", "price"] });
  });

  test("re-allocates the slug of a never-published draft from its new title, past its own", async () => {
    const { db, handed, selectWheres } = setup({ taken: ["aros-de-plata"] });
    db.$["update.returning"].mockResolvedValue([
      savedRow({ slug: "aros-de-plata-2" }),
    ]);

    await expect(
      update(
        db,
        productValues({
          translations: [translationInput({ title: "Aros de Plata" })],
        })
      )
    ).resolves.toMatchObject({ slug: "aros-de-plata-2" });
    // After the category, the article and its photos.
    expect(selectWheres()[3]).toEqual({
      params: [STORE_ID, "aros-de-plata%", 7],
      sql: '("product"."storeId" = $1 and "product"."slug" like $2 and "product"."id" <> $3)',
    });
    expect(handed("update", product, "set")).toEqual([
      {
        categoryId: 9,
        isAvailable: true,
        priceAmount: 1500,
        slug: "aros-de-plata-2",
      },
    ]);
  });

  test.each(["draft", "published"] as const)(
    "keeps the slug of a %s article once it was published, upserting its texts and dropping a language left out",
    async (status) => {
      const { db, handed, writes } = setup({
        locked: [lockedRow({ publishedAt: PUBLISHED_AT, status })],
        stored: [{ id: 1, position: 0, url: upload(UUID_A) }],
      });
      db.$["update.returning"].mockResolvedValue([
        savedRow({ slug: "collar-viejo", status }),
      ]);

      await expect(
        update(
          db,
          productValues({
            isAvailable: false,
            translations: [translationInput({ title: "Otro título" })],
          })
        )
      ).resolves.toEqual({
        discardedImageUrls: [],
        id: 7,
        publishGaps: [],
        slug: "collar-viejo",
        status,
        updatedAt: UPDATED_AT,
      });
      expect(db.$.execute).not.toHaveBeenCalled();
      expect(handed("update", product, "set")).toEqual([
        {
          categoryId: 9,
          isAvailable: false,
          priceAmount: 1500,
          slug: "collar-viejo",
        },
      ]);
      expect(
        handed("update", product, "where").map((where) => renderQuery(where))
      ).toEqual([{ params: [7, STORE_ID], sql: ARTICLE_SQL }]);
      expect(
        handed("delete", productTranslation, "where").map((where) =>
          renderQuery(where)
        )
      ).toEqual([
        {
          params: [7, "es"],
          sql: '("product_translation"."productId" = $1 and "product_translation"."locale" not in ($2))',
        },
      ]);
      expect(handed("insert", productTranslation, "values")).toEqual([
        [{ ...translationInput({ title: "Otro título" }), productId: 7 }],
      ]);
      const [upsert] = db.$["insert.onConflictDoUpdate"].mock.calls[0] ?? [];
      const { set, target } = upsert as {
        set: Record<string, unknown>;
        target: unknown;
      };
      // A language the article keeps stays the same row, its texts replaced.
      expect(target).toEqual([
        productTranslation.productId,
        productTranslation.locale,
      ]);
      expect(
        Object.fromEntries(
          Object.entries(set).map(([key, value]) => [key, renderSql(value)])
        )
      ).toEqual({
        description: 'excluded."description"',
        seoDescription: 'excluded."seoDescription"',
        seoTitle: 'excluded."seoTitle"',
        title: 'excluded."title"',
        updatedAt: 'excluded."updatedAt"',
      });
      expect(writes()).toEqual([
        ["update", product],
        ["delete", productTranslation],
        ["insert", productTranslation],
      ]);
      expect(replaceProductAttributeValues).toHaveBeenCalledExactlyOnceWith(
        db,
        { productId: 7, storeId: STORE_ID, valueIds: [21] }
      );
    }
  );

  test("fails loudly instead of answering a made-up row, writing nothing else", async () => {
    const { db, writes } = setup();

    await expect(update(db, productValues({ images: [] }))).rejects.toThrow(
      "Updating a locked article matched no row"
    );
    expect(writes()).toEqual([["update", product]]);
    expect(replaceProductAttributeValues).not.toHaveBeenCalled();
  });
});

describe("publishProduct", () => {
  test("refuses an article missing what publishing needs, changing nothing", async () => {
    const { db } = setup({
      imageTotal: 0,
      locked: [lockedRow({ categoryId: null, priceAmount: null })],
    });

    await expect(
      publishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "The article cannot be published yet. Missing: image, category, price, spanishTitle",
    });
    const [config] = db.query.productTranslation.findMany.mock.calls[0] ?? [];
    expect(renderQuery((config as { where: unknown }).where)).toEqual({
      params: [7],
      sql: '"product_translation"."productId" = $1',
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("refuses an article whose English texts have no title", async () => {
    const { db } = setup({ imageTotal: 1 });
    db.query.productTranslation.findMany.mockResolvedValue([
      { locale: "es", title: "Collar" },
      { locale: "en", title: "" },
    ]);

    await expect(
      publishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The article cannot be published yet. Missing: englishTitle",
    });
    expect(db.$.update).not.toHaveBeenCalled();
  });

  test("publishes a ready article, keeping a first publication date", async () => {
    const { db } = setup({ imageTotal: 1 });
    db.query.productTranslation.findMany.mockResolvedValue([
      { locale: "es", title: "Collar" },
    ]);
    const published = { id: 7, slug: "collar-viejo", status: "published" };
    db.$["update.returning"].mockResolvedValue([published]);

    await expect(
      publishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).resolves.toBe(published);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(product);
    const [set] = db.$["update.set"].mock.calls[0] ?? [];
    const { publishedAt, ...rest } = set as Record<string, unknown>;
    expect(rest).toEqual({ status: "published" });
    expect(renderSql(publishedAt)).toBe(
      'coalesce("product"."publishedAt", clock_timestamp())'
    );
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: ARTICLE_SQL,
    });
  });

  test("fails loudly when the update of the locked row returns none", async () => {
    const { db } = setup({ imageTotal: 1 });
    db.query.productTranslation.findMany.mockResolvedValue([
      { locale: "es", title: "Collar" },
    ]);

    await expect(
      publishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).rejects.toThrow("Publishing a locked article matched no row");
  });
});

describe("store-scoped single-row writes", () => {
  test("unpublishProduct sets the article back to draft", async () => {
    const { db } = setup();
    const updated = { id: 7, slug: "collar", status: "draft" };
    db.$["update.returning"].mockResolvedValue([updated]);

    await expect(
      unpublishProduct(db as never, { id: 7, storeId: STORE_ID })
    ).resolves.toBe(updated);
    expect(db.$.update).toHaveBeenCalledExactlyOnceWith(product);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      status: "draft",
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: ARTICLE_SQL,
    });
  });

  test("setProductAvailability sets the flag only", async () => {
    const { db } = setup();
    const updated = { id: 7, isAvailable: false };
    db.$["update.returning"].mockResolvedValue([updated]);

    await expect(
      setProductAvailability(db as never, {
        id: 7,
        isAvailable: false,
        storeId: STORE_ID,
      })
    ).resolves.toBe(updated);
    expect(db.$["update.set"]).toHaveBeenCalledExactlyOnceWith({
      isAvailable: false,
    });
    expect(renderQuery(db.$["update.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: ARTICLE_SQL,
    });
  });

  test("deleteProduct locks the store's article, deletes it and answers its images' addresses", async () => {
    const { db, selectWheres } = setup();
    db.$["select.where"].mockImplementation(async (where: unknown) =>
      renderSql(where) === IMAGES_OF_SQL
        ? await Promise.resolve([
            { url: "https://cdn.example.com/a.webp" },
            { url: "https://cdn.example.com/b.webp" },
          ])
        : await Promise.resolve([])
    );
    db.$["delete.returning"].mockResolvedValue([{ id: 7 }]);

    await expect(
      deleteProduct(db as never, { id: 7, storeId: STORE_ID })
    ).resolves.toEqual({
      id: 7,
      imageUrls: [
        "https://cdn.example.com/a.webp",
        "https://cdn.example.com/b.webp",
      ],
    });
    expect(selectWheres()).toEqual([
      { params: [7, STORE_ID], sql: ARTICLE_SQL },
      { params: [7], sql: IMAGES_OF_SQL },
    ]);
    expect(db.$["select.for"]).toHaveBeenCalledExactlyOnceWith("update");
    expect(db.$.delete).toHaveBeenCalledExactlyOnceWith(product);
    expect(renderQuery(db.$["delete.where"].mock.calls[0]?.[0])).toEqual({
      params: [7, STORE_ID],
      sql: ARTICLE_SQL,
    });
  });

  test("deleteProduct throws a plain error when the locked article's delete matches nothing", async () => {
    const { db } = setup();

    await expect(
      deleteProduct(db as never, { id: 7, storeId: STORE_ID })
    ).rejects.toThrow(new Error("Deleting a locked article matched no row"));
  });

  test.each([
    [
      "unpublishProduct",
      async (db: never) =>
        await unpublishProduct(db, { id: 7, storeId: STORE_ID }),
    ],
    [
      "setProductAvailability",
      async (db: never) =>
        await setProductAvailability(db, {
          id: 7,
          isAvailable: true,
          storeId: STORE_ID,
        }),
    ],
    [
      "deleteProduct",
      async (db: never) =>
        await deleteProduct(db, { id: 7, storeId: STORE_ID }),
    ],
    [
      "publishProduct",
      async (db: never) =>
        await publishProduct(db, { id: 7, storeId: STORE_ID }),
    ],
  ])(
    "%s answers NOT_FOUND when the store has no such article",
    async (_name, write) => {
      const { db } = setup({ locked: [] });

      await expect(write(db as never)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "Article not found",
      });
    }
  );
});

/** The `where`, `orderBy`, `columns` and `with` a relational read was handed. */
interface ReadConfig {
  columns?: Record<string, boolean>;
  limit?: number;
  orderBy?: unknown;
  where: unknown;
  with?: Record<
    string,
    { limit?: number; orderBy?: unknown; with?: Record<string, unknown> }
  >;
}

function configOf(fn: MockDb["query"]["product"]["findMany"]): ReadConfig {
  return fn.mock.calls[0]?.[0] as ReadConfig;
}

function storedArticle(overrides: Record<string, unknown> = {}) {
  return {
    attributeValues: [{ attributeValueId: 21 }, { attributeValueId: 24 }],
    categoryId: 9,
    id: 7,
    images: [
      { height: 1600, id: 2, url: upload(UUID_B), width: 1200 },
      { height: 800, id: 1, url: "/seed/ring-1.jpg", width: 800 },
    ],
    isAvailable: true,
    priceAmount: 1500,
    publishedAt: null,
    slug: "collar-dorado",
    status: "draft",
    store: { currencyCode: "UYU" },
    translations: [
      {
        description: "Handmade",
        locale: "en",
        seoDescription: null,
        seoTitle: "Necklace",
        title: "Gold necklace",
      },
      {
        description: "Hecho a mano",
        locale: "es",
        seoDescription: "Dorado",
        seoTitle: null,
        title: "Collar dorado",
      },
    ],
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

describe("getStoreProduct", () => {
  test("reads the store's article by id in one statement, photos and values in order", async () => {
    const { db } = setup();
    db.query.product.findFirst.mockResolvedValue(storedArticle());

    await getStoreProduct(db as never, { id: 7, storeId: STORE_ID });

    const config = configOf(db.query.product.findFirst);
    expect(renderQuery(config.where)).toEqual({
      params: [7, STORE_ID],
      sql: ARTICLE_SQL,
    });
    expect(config.columns).toEqual({
      categoryId: true,
      id: true,
      isAvailable: true,
      priceAmount: true,
      publishedAt: true,
      slug: true,
      status: true,
      updatedAt: true,
    });
    expect(renderOrderBy(config.with?.images?.orderBy)).toBe(
      '"product_image"."position" asc, "product_image"."id" asc'
    );
    expect(renderOrderBy(config.with?.attributeValues?.orderBy)).toBe(
      `"product_attribute_value"."attributeValueId" asc`
    );
    expect(new Set(Object.keys(config.with ?? {}))).toEqual(
      new Set(["attributeValues", "images", "store", "translations"])
    );
  });

  test("answers everything the wizard restores, Spanish first, with what publishing needs", async () => {
    const { db } = setup();
    db.query.product.findFirst.mockResolvedValue(storedArticle());

    await expect(
      getStoreProduct(db as never, { id: 7, storeId: STORE_ID })
    ).resolves.toEqual({
      attributeValueIds: [21, 24],
      categoryId: 9,
      currencyCode: "UYU",
      id: 7,
      images: [
        { height: 1600, id: 2, url: upload(UUID_B), width: 1200 },
        { height: 800, id: 1, url: "/seed/ring-1.jpg", width: 800 },
      ],
      isAvailable: true,
      priceAmount: 1500,
      publishGaps: [],
      publishedAt: null,
      slug: "collar-dorado",
      status: "draft",
      translations: [
        {
          description: "Hecho a mano",
          locale: "es",
          seoDescription: "Dorado",
          seoTitle: null,
          title: "Collar dorado",
        },
        {
          description: "Handmade",
          locale: "en",
          seoDescription: null,
          seoTitle: "Necklace",
          title: "Gold necklace",
        },
      ],
      updatedAt: UPDATED_AT,
    });
  });

  test("names the gaps of a blank draft", async () => {
    const { db } = setup();
    db.query.product.findFirst.mockResolvedValue(
      storedArticle({
        attributeValues: [],
        categoryId: null,
        images: [],
        priceAmount: null,
        translations: [
          {
            description: "",
            locale: "es",
            seoDescription: null,
            seoTitle: null,
            title: "",
          },
        ],
      })
    );

    await expect(
      getStoreProduct(db as never, { id: 7, storeId: STORE_ID })
    ).resolves.toMatchObject({
      attributeValueIds: [],
      images: [],
      publishGaps: ["image", "category", "price", "spanishTitle"],
    });
  });

  test("answers NOT_FOUND for another store's article or none", async () => {
    const { db } = setup();

    await expect(
      getStoreProduct(db as never, { id: 7, storeId: STORE_ID })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Article not found",
    });
  });
});

function listedRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    category: {
      id: 9,
      translations: [
        { locale: "en", name: "Necklaces" },
        { locale: "es", name: "Collares" },
      ],
    },
    id,
    images: [{ height: 1600, url: upload(UUID_A), width: 1200 }],
    isAvailable: true,
    priceAmount: 1500,
    slug: `articulo-${id}`,
    status: "published",
    translations: [
      { locale: "en", title: `Article ${id}` },
      { locale: "es", title: `Artículo ${id}` },
    ],
    updatedAt: UPDATED_AT,
    ...overrides,
  };
}

describe("listStoreProducts", () => {
  async function list(
    db: MockDb,
    options: Partial<Parameters<typeof listStoreProducts>[1]> = {}
  ) {
    return await listStoreProducts(db as never, {
      limit: 2,
      storeId: STORE_ID,
      ...options,
    });
  }

  function answerCurrency(db: MockDb) {
    db.$["select.where"].mockImplementation(async (where: unknown) =>
      renderSql(where) === '"store"."id" = $1'
        ? await Promise.resolve([{ currencyCode: "USD" }])
        : await Promise.resolve([])
    );
  }

  test("reads the store's articles, drafts too, newest change first, one row past the page", async () => {
    const { db } = setup();
    answerCurrency(db);

    await list(db);

    const config = configOf(db.query.product.findMany);
    expect(renderQuery(config.where)).toEqual({
      params: [STORE_ID],
      sql: '"product"."storeId" = $1',
    });
    expect(renderOrderBy(config.orderBy)).toBe(
      '"product"."updatedAt" desc, "product"."id" desc'
    );
    expect(config.limit).toBe(3);
    expect(config.with?.images?.limit).toBe(1);
    expect(renderOrderBy(config.with?.images?.orderBy)).toBe(
      '"product_image"."position" asc, "product_image"."id" asc'
    );
    expect(db.$["select.from"]).toHaveBeenCalledExactlyOnceWith(store);
  });

  test("continues after the cursor's change and id, both", async () => {
    const { db } = setup();
    answerCurrency(db);

    await list(db, {
      cursor: { id: 40, updatedAt: "2026-11-17T09:30:00.456Z" },
    });

    expect(renderQuery(configOf(db.query.product.findMany).where)).toEqual({
      params: [
        STORE_ID,
        "2026-11-17T09:30:00.456Z",
        "2026-11-17T09:30:00.456Z",
        40,
      ],
      sql: '("product"."storeId" = $1 and ("product"."updatedAt" < $2 or ("product"."updatedAt" = $3 and "product"."id" < $4)))',
    });
  });

  test("answers a full page with the next cursor at its last row when one more follows", async () => {
    const { db } = setup();
    answerCurrency(db);
    db.query.product.findMany.mockResolvedValue([
      listedRow(5),
      listedRow(4, { updatedAt: new Date("2026-11-16T08:00:00.000Z") }),
      listedRow(3),
    ]);

    const page = await list(db);

    expect(page.items.map((item) => item.id)).toEqual([5, 4]);
    expect(page.nextCursor).toEqual({
      id: 4,
      updatedAt: "2026-11-16T08:00:00.000Z",
    });
    expect(page.currencyCode).toBe("USD");
  });

  test.each([
    ["a page that ends the list", [listedRow(5), listedRow(4)]],
    ["an empty list", []],
  ])("has no next cursor for %s", async (_case, rows) => {
    const { db } = setup();
    answerCurrency(db);
    db.query.product.findMany.mockResolvedValue(rows);

    await expect(list(db)).resolves.toMatchObject({ nextCursor: null });
  });

  test("shows each article by its cover, its Spanish title and its category in both languages", async () => {
    const { db } = setup();
    answerCurrency(db);
    db.query.product.findMany.mockResolvedValue([listedRow(5)]);

    await expect(list(db)).resolves.toEqual({
      currencyCode: "USD",
      items: [
        {
          category: { id: 9, nameEn: "Necklaces", nameEs: "Collares" },
          cover: { height: 1600, url: upload(UUID_A), width: 1200 },
          id: 5,
          isAvailable: true,
          priceAmount: 1500,
          slug: "articulo-5",
          status: "published",
          title: "Artículo 5",
          titleLang: "es",
          updatedAt: UPDATED_AT,
        },
      ],
      nextCursor: null,
    });
  });

  test.each([
    [
      "the English title where the Spanish one is blank",
      [
        { locale: "es", title: " " },
        { locale: "en", title: "Chain" },
      ],
      "Chain",
      "en",
    ],
    ["none for a blank draft", [{ locale: "es", title: "" }], null, null],
    [
      "none where English is blank too",
      [
        { locale: "es", title: "" },
        { locale: "en", title: "" },
      ],
      null,
      null,
    ],
  ])("names an article by %s", async (_case, translations, title, lang) => {
    const { db } = setup();
    answerCurrency(db);
    db.query.product.findMany.mockResolvedValue([
      listedRow(5, { translations }),
    ]);

    const [item] = (await list(db)).items;

    expect([item?.title, item?.titleLang]).toEqual([title, lang]);
  });

  test("shows a draft without a photo, a category or a price as having none", async () => {
    const { db } = setup();
    answerCurrency(db);
    db.query.product.findMany.mockResolvedValue([
      listedRow(5, {
        category: null,
        images: [],
        priceAmount: null,
        status: "draft",
      }),
    ]);

    const [item] = (await list(db)).items;

    expect(item).toMatchObject({
      category: null,
      cover: null,
      priceAmount: null,
      status: "draft",
    });
  });

  test("names a category without an English name by none, and one without names by nothing", async () => {
    const { db } = setup();
    answerCurrency(db);
    db.query.product.findMany.mockResolvedValue([
      listedRow(5, {
        category: { id: 9, translations: [{ locale: "es", name: "Aros" }] },
      }),
      listedRow(4, { category: { id: 8, translations: [] } }),
    ]);

    const { items } = await list(db);

    expect(items.map((item) => item.category)).toEqual([
      { id: 9, nameEn: null, nameEs: "Aros" },
      { id: 8, nameEn: null, nameEs: "" },
    ]);
  });

  test("answers NOT_FOUND when the store itself is missing", async () => {
    const { db } = setup();

    await expect(list(db)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Store not found",
    });
  });
});
