import { describe, expect, test } from "vitest";

import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORTS,
  productCursorSchema,
  catalogFiltersSchema,
  createAttributeFormSchema,
  createAttributeSchema,
  createAttributeValueSchema,
  CATEGORY_SEO_DESCRIPTION_MAX_LENGTH,
  CATEGORY_SEO_TITLE_MAX_LENGTH,
  COVER_ALT_MAX_LENGTH,
  createCategoryFormSchema,
  createCategoryPageFormSchema,
  createCategorySchema,
  createProductSchema,
  updateProductSchema,
  deleteAttributeSchema,
  deleteAttributeValueSchema,
  deleteCategorySchema,
  listCatalogFiltersSchema,
  listProductsSchema,
  listRelatedProductsSchema,
  renameAttributeSchema,
  renameCategorySchema,
  reorderAttributesSchema,
  reorderAttributeValuesSchema,
  reorderCategoriesSchema,
  listStoreProductsSchema,
  CATALOG_FILTER_VALUES_MAX,
  productIdSchema,
  SEARCH_MAX_LENGTH,
  STORE_PRODUCTS_COUNT_CAP,
  SWATCH_COLOR_PATTERN,
  updateAttributeValueSchema,
  updateCategoryPageSchema,
} from ".";

function makeTranslation(overrides: Record<string, unknown> = {}) {
  return {
    description: "Baño de oro",
    locale: "es",
    seoDescription: null,
    seoTitle: null,
    title: "Cadena",
    ...overrides,
  };
}

const UPLOAD = "https://store9.public.blob.vercel-storage.com/qa/product";

function makeImage(overrides: Record<string, unknown> = {}) {
  return {
    height: 1600,
    url: `${UPLOAD}/a.webp`,
    width: 1200,
    ...overrides,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    attributeValueIds: [],
    categoryId: 1,
    images: [makeImage()],
    isAvailable: true,
    priceAmount: 129_000,
    translations: [makeTranslation()],
    ...overrides,
  };
}

const accepts = (input: unknown) =>
  createProductSchema.safeParse(input).success;

describe("createProductSchema", () => {
  test.each([
    ["a price of 0", { priceAmount: 0 }, true],
    ["a price of -1", { priceAmount: -1 }, false],
    ["the highest price", { priceAmount: 99_999_999 }, true],
    ["one above it", { priceAmount: 100_000_000 }, false],
    ["a fractional price", { priceAmount: 12.5 }, false],
    ["no price yet", { priceAmount: null }, true],
    ["no category yet", { categoryId: null }, true],
    ["a category id of 0", { categoryId: 0 }, false],
    ["a category id sent as true", { categoryId: true }, false],
    ["a category id sent as text", { categoryId: "1" }, false],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(accepts(makeProduct(overrides))).toBe(accepted);
  });

  test.each([
    ["only Spanish", [makeTranslation()], true],
    [
      "Spanish and English",
      [makeTranslation(), makeTranslation({ locale: "en", title: "Chain" })],
      true,
    ],
    ["only English", [makeTranslation({ locale: "en" })], false],
    ["Spanish twice", [makeTranslation(), makeTranslation()], false],
    ["none", [], false],
  ])("texts in %s are accepted: %s", (_case, translations, accepted) => {
    expect(accepts(makeProduct({ translations }))).toBe(accepted);
  });

  test.each([
    // A draft is created from its first photo, before it has a name.
    ["a blank title", { title: "   " }, true],
    ["no title", { title: "" }, true],
    ["a title of 120 characters", { title: "x".repeat(120) }, true],
    ["a title of 121 characters", { title: "x".repeat(121) }, false],
    ["an SEO title of 70 characters", { seoTitle: "x".repeat(70) }, true],
    ["an SEO title of 71 characters", { seoTitle: "x".repeat(71) }, false],
    [
      "an SEO description of 160 characters",
      { seoDescription: "x".repeat(160) },
      true,
    ],
    [
      "an SEO description of 161 characters",
      { seoDescription: "x".repeat(161) },
      false,
    ],
    [
      "a description of 4000 characters",
      { description: "x".repeat(4000) },
      true,
    ],
    [
      "a description of 4001 characters",
      { description: "x".repeat(4001) },
      false,
    ],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(
      accepts(makeProduct({ translations: [makeTranslation(overrides)] }))
    ).toBe(accepted);
  });

  test("keeps a blank Spanish row: a draft not named yet still has its texts", () => {
    const parsed = createProductSchema.parse(
      makeProduct({
        translations: [makeTranslation({ description: " ", title: "   " })],
      })
    );

    expect(parsed.translations).toEqual([
      {
        description: "",
        locale: "es",
        seoDescription: null,
        seoTitle: null,
        title: "",
      },
    ]);
  });

  test.each([
    [
      "drops an English row with no text at all",
      { description: "  ", seoDescription: "", seoTitle: " ", title: "" },
      ["es"],
    ],
    [
      "keeps an English row holding only a description",
      { description: "Gold chain", title: "" },
      ["es", "en"],
    ],
    [
      "keeps an English row holding only an SEO title",
      { description: "", seoTitle: "Chain", title: "" },
      ["es", "en"],
    ],
    [
      "keeps an English row holding only an SEO description",
      { description: "", seoDescription: "A chain", title: "" },
      ["es", "en"],
    ],
    [
      "keeps an English row holding only a title",
      { description: "", title: "Chain" },
      ["es", "en"],
    ],
  ])("%s", (_case, english, locales) => {
    const parsed = createProductSchema.parse(
      makeProduct({
        translations: [
          makeTranslation(),
          makeTranslation({ locale: "en", ...english }),
        ],
      })
    );

    expect(parsed.translations.map((row) => row.locale)).toEqual(locales);
  });

  test.each([
    ["no photo", [], true],
    ["eight photos", Array.from({ length: 8 }, (_, index) => index), true],
    ["nine photos", Array.from({ length: 9 }, (_, index) => index), false],
  ])("%s is accepted: %s", (_case, photos, accepted) => {
    expect(
      accepts(
        makeProduct({
          images: photos.map((index) =>
            makeImage({ url: `${UPLOAD}/${index}.webp` })
          ),
        })
      )
    ).toBe(accepted);
  });

  test.each([
    ["an upload's address", `${UPLOAD}/a.webp`, true],
    ["a path on this site, as the seed stores one", "/seed/ring-1.jpg", true],
    ["a site path with a folder", "/seed/rings/ring-1.jpg", true],
    ["another site's address over HTTP", "http://cdn.example.com/a.jpg", false],
    ["an address with no scheme", "//cdn.example.com/a.jpg", false],
    ["a relative path", "seed/ring-1.jpg", false],
    ["a site path with a query", "/seed/ring-1.jpg?v=1", false],
    ["a site path with a space", "/seed/ring 1.jpg", false],
    ["a data address", "data:image/png;base64,iVBORw0KGgo=", false],
    ["a site path of 500 characters", `/${"a".repeat(499)}`, true],
    ["a site path of 501 characters", `/${"a".repeat(500)}`, false],
    ["nothing", "", false],
  ])("a photo at %s is accepted: %s", (_case, url, accepted) => {
    expect(accepts(makeProduct({ images: [makeImage({ url })] }))).toBe(
      accepted
    );
  });

  test.each([
    ["the largest side", { height: 2400, width: 2400 }, true],
    ["one pixel over it", { width: 2401 }, false],
    ["no height", { height: 0 }, false],
  ])("a photo with %s is accepted: %s", (_case, overrides, accepted) => {
    expect(accepts(makeProduct({ images: [makeImage(overrides)] }))).toBe(
      accepted
    );
  });

  test("names a photo given twice in its message, the address read as a URL writes it", () => {
    const result = createProductSchema.safeParse(
      makeProduct({
        images: [
          makeImage(),
          makeImage({
            url: `${UPLOAD.replace("store9", "STORE9")}/a.webp`,
          }),
        ],
      })
    );

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Each photo at most once",
    ]);
  });

  test("keeps the photos in the order given, each address as a URL writes it", () => {
    const parsed = createProductSchema.parse(
      makeProduct({
        images: [
          makeImage({
            url: `HTTPS://STORE9.public.blob.vercel-storage.com/qa/product/b.webp`,
          }),
          makeImage({ url: "/seed/ring-1.jpg" }),
        ],
      })
    );

    expect(parsed.images.map((image) => image.url)).toEqual([
      `${UPLOAD}/b.webp`,
      "/seed/ring-1.jpg",
    ]);
  });

  test.each([
    ["none", [], true],
    ["50 values", Array.from({ length: 50 }, (_, index) => index + 1), true],
    ["51 values", Array.from({ length: 51 }, (_, index) => index + 1), false],
    ["a value twice", [21, 21], false],
    ["an id sent as text", ["21"], false],
    ["an id of 0", [0], false],
  ])(
    "filter values: %s is accepted: %s",
    (_case, attributeValueIds, accepted) => {
      expect(accepts(makeProduct({ attributeValueIds }))).toBe(accepted);
    }
  );

  test("names a repeated filter value in its message", () => {
    expect(
      createProductSchema
        .safeParse(makeProduct({ attributeValueIds: [21, 21] }))
        .error?.issues.map((issue) => issue.message)
    ).toEqual(["Each value at most once"]);
  });

  test.each([
    ["photos", "images"],
    ["filter values", "attributeValueIds"],
  ])("refuses an article without its %s list", (_case, field) => {
    const { [field as "images"]: _left, ...rest } = makeProduct();

    expect(accepts(rest)).toBe(false);
  });

  test("trims the texts and stores a blank SEO field as none", () => {
    const parsed = createProductSchema.parse(
      makeProduct({
        translations: [
          makeTranslation({ seoTitle: "  ", title: "  Cadena  " }),
        ],
      })
    );

    expect(parsed.translations[0]).toMatchObject({
      seoTitle: null,
      title: "Cadena",
    });
  });
});

describe("listProductsSchema", () => {
  test("defaults the page to 24 and reads a blank search as none", () => {
    expect(
      listProductsSchema.parse({
        locale: "es",
        q: "   ",
      })
    ).toEqual({
      limit: 24,
      locale: "es",
      q: undefined,
      sort: "position",
    });
  });

  test.each(["position", "newest", "price_asc", "price_desc"])(
    "a sort of %j is accepted as itself",
    (sort) => {
      expect(
        listProductsSchema.safeParse({
          locale: "es",
          sort,
        }).data?.sort
      ).toBe(sort);
    }
  );

  test.each(["price", "NEWEST", ""])("a sort of %j is refused", (sort) => {
    expect(
      listProductsSchema.safeParse({
        locale: "es",
        sort,
      }).success
    ).toBe(false);
  });

  test("offers the store's order, both price orders and the newest first, in that order", () => {
    expect(PRODUCT_SORTS).toEqual([
      "position",
      "price_asc",
      "price_desc",
      "newest",
    ]);
    expect(DEFAULT_PRODUCT_SORT).toBe("position");
  });

  test.each([
    [{ limit: 48 }, true],
    [{ limit: 49 }, false],
    [{ limit: 0 }, false],
    [{ q: "x".repeat(100) }, true],
    [{ q: "x".repeat(101) }, false],
    [{ category: "Cadenas Doradas" }, false],
    [{ category: "cadenas-doradas" }, true],
    [
      {
        cursor: {
          id: 3,
          publishedAt: "2026-11-15T10:00:00.000Z",
          sort: "newest",
        },
      },
      true,
    ],
    [{ cursor: { id: 3, publishedAt: "yesterday", sort: "newest" } }, false],
    [
      {
        cursor: {
          id: 3,
          publishedAt: "0000-01-01T00:00:00.000Z",
          sort: "newest",
        },
      },
      false,
    ],
    [
      {
        cursor: {
          id: 3,
          publishedAt: "0001-01-01T00:00:00.000Z",
          sort: "newest",
        },
      },
      true,
    ],
    [
      {
        cursor: {
          id: 2_147_483_647,
          publishedAt: "2026-11-15T10:00:00.000Z",
          sort: "newest",
        },
      },
      true,
    ],
    [
      {
        cursor: {
          id: 2_147_483_648,
          publishedAt: "2026-11-15T10:00:00.000Z",
          sort: "newest",
        },
      },
      false,
    ],
    // The REST surface sends numbers as text.
    [{ limit: "12" }, true],
    [{ limit: "" }, false],
    [{ locale: "fr" }, false],
  ])("%j is accepted: %s", (overrides, accepted) => {
    expect(
      listProductsSchema.safeParse({
        locale: "es",
        ...overrides,
      }).success
    ).toBe(accepted);
  });
});

describe("listRelatedProductsSchema", () => {
  test.each([
    [undefined, 4],
    [12, 12],
  ])("a limit of %j asks for %d", (limit, expected) => {
    expect(
      listRelatedProductsSchema.parse({
        limit,
        locale: "es",
        slug: "cadena",
      }).limit
    ).toBe(expected);
  });

  test("refuses more than 12", () => {
    expect(
      listRelatedProductsSchema.safeParse({
        limit: 13,
        locale: "es",
        slug: "cadena",
      }).success
    ).toBe(false);
  });
});

describe("updateProductSchema", () => {
  test("reads the article's id from the path, beside the whole article", () => {
    expect(
      updateProductSchema.parse({ ...makeProduct(), id: "5" })
    ).toMatchObject({ id: 5, images: [makeImage()] });
  });

  test.each([["0"], [""], ["x"]])("refuses an article id of %j", (id) => {
    expect(
      updateProductSchema.safeParse({ ...makeProduct(), id }).success
    ).toBe(false);
  });
});

describe("productIdSchema", () => {
  test("reads the id from the path as a number", () => {
    expect(productIdSchema.parse({ id: "12" })).toEqual({ id: 12 });
  });
});

describe("listStoreProductsSchema", () => {
  test("reads the first page of 24, most recent change first, in the page's language", () => {
    expect(listStoreProductsSchema.parse({ locale: "es" })).toEqual({
      limit: 24,
      locale: "es",
      page: 1,
      sort: "updated",
    });
  });

  test.each([undefined, "fr", ""])("refuses a language of %j", (locale) => {
    expect(listStoreProductsSchema.safeParse({ locale }).success).toBe(false);
  });

  test.each([
    ["1", 1, true],
    ["2", 2, true],
    [STORE_PRODUCTS_COUNT_CAP, STORE_PRODUCTS_COUNT_CAP, true],
    [STORE_PRODUCTS_COUNT_CAP + 1, undefined, false],
    ["0", undefined, false],
    ["", undefined, false],
    ["1.5", undefined, false],
  ])("a page of %j reads as %s", (page, parsed, accepted) => {
    const result = listStoreProductsSchema.safeParse({ locale: "en", page });

    expect(result.success).toBe(accepted);
    expect(result.data?.page).toBe(parsed);
  });

  test.each([
    ["1", 1, true],
    ["48", 48, true],
    ["0", undefined, false],
    ["49", undefined, false],
    ["", undefined, false],
  ])("a page size of %j reads as %s", (limit, parsed, accepted) => {
    const result = listStoreProductsSchema.safeParse({ limit, locale: "en" });

    expect(result.success).toBe(accepted);
    expect(result.data?.limit).toBe(parsed);
  });

  test.each([
    ["  anillo  ", "anillo", true],
    ["   ", undefined, true],
    ["a".repeat(SEARCH_MAX_LENGTH), "a".repeat(SEARCH_MAX_LENGTH), true],
    ["a".repeat(SEARCH_MAX_LENGTH + 1), undefined, false],
  ])("a search of %j reads as %j", (q, parsed, accepted) => {
    const result = listStoreProductsSchema.safeParse({ locale: "es", q });

    expect(result.success).toBe(accepted);
    expect(result.data?.q).toBe(parsed);
  });

  test("takes a whole selection: sort, direction, status, availability, categories and filters", () => {
    expect(
      listStoreProductsSchema.parse({
        availability: "unavailable",
        categories: ["anillos", "bijouterie"],
        dir: "desc",
        filters: [{ attribute: "color", values: ["dorado", "violeta"] }],
        locale: "en",
        sort: "price",
        status: "draft",
      })
    ).toEqual({
      availability: "unavailable",
      categories: ["anillos", "bijouterie"],
      dir: "desc",
      filters: [{ attribute: "color", values: ["dorado", "violeta"] }],
      limit: 24,
      locale: "en",
      page: 1,
      sort: "price",
      status: "draft",
    });
  });

  test.each([
    ["an unknown sort", { sort: "position" }],
    ["an unknown direction", { dir: "up" }],
    ["an unknown status", { status: "archived" }],
    ["an unknown availability", { availability: "yes" }],
    ["a category that is no slug", { categories: ["Anillos"] }],
    [
      "more categories than the limit",
      {
        categories: Array.from(
          { length: CATALOG_FILTER_VALUES_MAX + 1 },
          (_, index) => `c-${index}`
        ),
      },
    ],
    [
      "a filter value that is no slug",
      { filters: [{ attribute: "color", values: ["Dorado"] }] },
    ],
    [
      "a filter without values",
      { filters: [{ attribute: "color", values: [] }] },
    ],
  ])("refuses %s", (_case, input) => {
    expect(
      listStoreProductsSchema.safeParse({ locale: "es", ...input }).success
    ).toBe(false);
  });

  test("takes as many categories as the limit", () => {
    const categories = Array.from(
      { length: CATALOG_FILTER_VALUES_MAX },
      (_, index) => `c-${index}`
    );

    expect(
      listStoreProductsSchema.parse({ categories, locale: "es" }).categories
    ).toEqual(categories);
  });
});

function makeCategoryNames(overrides: Record<string, unknown> = {}) {
  return {
    nameEn: "Necklaces",
    nameEs: "Collares",
    ...overrides,
  };
}

describe("createCategorySchema", () => {
  test("trims both names and keeps the English one", () => {
    expect(
      createCategorySchema.parse(
        makeCategoryNames({ nameEn: "  Necklaces ", nameEs: "  Collares  " })
      )
    ).toEqual({
      nameEn: "Necklaces",
      nameEs: "Collares",
    });
  });

  test.each([
    ["blank", "   "],
    ["empty", ""],
    ["missing", null],
  ])("reads a %s English name as none", (_case, nameEn) => {
    expect(
      createCategorySchema.parse(makeCategoryNames({ nameEn })).nameEn
    ).toBeNull();
  });

  test.each([
    ["a Spanish name of 60 characters", { nameEs: "x".repeat(60) }, true],
    ["a Spanish name of 61 characters", { nameEs: "x".repeat(61) }, false],
    [
      "a Spanish name of 60 between spaces",
      { nameEs: ` ${"x".repeat(60)} ` },
      true,
    ],
    ["a blank Spanish name", { nameEs: "   " }, false],
    ["no Spanish name", { nameEs: undefined }, false],
    ["an English name of 60 characters", { nameEn: "x".repeat(60) }, true],
    ["an English name of 61 characters", { nameEn: "x".repeat(61) }, false],
    ["no English field at all", { nameEn: undefined }, false],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(
      createCategorySchema.safeParse(makeCategoryNames(overrides)).success
    ).toBe(accepted);
  });
});

describe("renameCategorySchema", () => {
  test("reads the id from the path as a number", () => {
    expect(
      renameCategorySchema.parse(makeCategoryNames({ id: "5", nameEn: "" }))
    ).toEqual({
      id: 5,
      nameEn: null,
      nameEs: "Collares",
    });
  });

  test.each([
    ["", false],
    ["0", false],
    ["2147483647", true],
    ["2147483648", false],
  ])("an id of %j is accepted: %s", (id, accepted) => {
    expect(
      renameCategorySchema.safeParse(makeCategoryNames({ id })).success
    ).toBe(accepted);
  });
});

describe("reorderCategoriesSchema", () => {
  test.each([
    [[3, 1, 2], true],
    [[1], true],
    [[1, 1], false],
    [[], false],
    [["1"], false],
    [[true], false],
    [[0], false],
  ])("ids %j are accepted: %s", (ids, accepted) => {
    expect(reorderCategoriesSchema.safeParse({ ids }).success).toBe(accepted);
  });

  test("names a repeated id in its message", () => {
    const parsed = reorderCategoriesSchema.safeParse({
      ids: [2, 2],
    });

    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([
      "Each category at most once",
    ]);
  });
});

describe("deleteCategorySchema", () => {
  test.each([
    [
      { id: "5", moveToId: null },
      { id: 5, moveToId: null },
    ],
    [
      { id: 5, moveToId: 6 },
      { id: 5, moveToId: 6 },
    ],
  ])("reads %j as %j", (input, expected) => {
    expect(deleteCategorySchema.parse({ ...input })).toEqual({ ...expected });
  });

  test.each([
    ["sent as text", { moveToId: "6" }],
    ["sent as true", { moveToId: true }],
    ["missing", { moveToId: undefined }],
    ["0", { moveToId: 0 }],
  ])("refuses a destination %s", (_case, overrides) => {
    expect(
      deleteCategorySchema.safeParse({
        id: 5,
        ...overrides,
      }).success
    ).toBe(false);
  });
});

describe("createCategoryFormSchema", () => {
  const schema = createCategoryFormSchema({
    nameRequired: "Write the name",
    nameTooLong: "Too long",
  });
  const messagesOf = (input: unknown) =>
    schema
      .safeParse(input)
      .error?.issues.map((issue) => [issue.path.join("."), issue.message]);

  test.each([
    [{ nameEn: "", nameEs: "  " }, [["nameEs", "Write the name"]]],
    [{ nameEn: "", nameEs: "x".repeat(61) }, [["nameEs", "Too long"]]],
    [{ nameEn: "x".repeat(61), nameEs: "Collares" }, [["nameEn", "Too long"]]],
    [{ nameEn: "x".repeat(60), nameEs: "x".repeat(60) }, undefined],
  ])("%j shows %j", (input, expected) => {
    expect(messagesOf(input)).toEqual(expected);
  });

  test("keeps a blank English name as text: the form sends it as none", () => {
    expect(schema.parse({ nameEn: "  ", nameEs: " Collares " })).toEqual({
      nameEn: "",
      nameEs: "Collares",
    });
  });
});

function makePageInput(overrides: Record<string, unknown> = {}) {
  return {
    coverAltEn: "",
    coverAltEs: "",
    id: 5,
    parentId: null,
    seoDescriptionEn: "",
    seoDescriptionEs: "",
    seoTitleEn: "",
    seoTitleEs: "",
    ...overrides,
  };
}

describe("updateCategoryPageSchema's cover (FER-011)", () => {
  const image = {
    height: 800,
    url: "https://store9.public.blob.vercel-storage.com/qa/cover/a.webp",
    width: 2400,
  };

  // What is kept, not only that it parses: a field the schema did not know
  // would be stripped, and the case would still pass on `success` alone.
  test.each([
    ["an uploaded image", { cover: image }, { cover: image }],
    [
      "none, to remove it",
      { cover: null, coverPhone: null },
      { cover: null, coverPhone: null },
    ],
    ["left out, to keep it", {}, {}],
    ["a phone image only", { coverPhone: image }, { coverPhone: image }],
  ])("takes %s", (_case, overrides, kept) => {
    const parsed = updateCategoryPageSchema.parse(makePageInput(overrides));

    expect({ cover: parsed.cover, coverPhone: parsed.coverPhone }).toEqual({
      cover: undefined,
      coverPhone: undefined,
      ...kept,
    });
    expect(Object.hasOwn(parsed, "cover")).toBe("cover" in kept);
    expect(Object.hasOwn(parsed, "coverPhone")).toBe("coverPhone" in kept);
  });

  test.each([
    ["a seed's local path", { cover: { ...image, url: "/seed/a.jpg" } }],
    ["an image wider than uploads make", { cover: { ...image, width: 2401 } }],
    [
      "a phone image wider than uploads make",
      { coverPhone: { ...image, width: 2401 } },
    ],
  ])("refuses %s", (_case, overrides) => {
    expect(
      updateCategoryPageSchema.safeParse(makePageInput(overrides)).success
    ).toBe(false);
  });
});

describe("updateCategoryPageSchema", () => {
  test("reads blank texts as none, so the page writes its own", () => {
    expect(
      updateCategoryPageSchema.parse(
        makePageInput({ seoTitleEn: "   ", seoTitleEs: " Anillos dorados " })
      )
    ).toEqual({
      coverAltEn: null,
      coverAltEs: null,
      id: 5,
      parentId: null,
      seoDescriptionEn: null,
      seoDescriptionEs: null,
      seoTitleEn: null,
      seoTitleEs: "Anillos dorados",
    });
  });

  test.each([
    ["seoTitleEs", CATEGORY_SEO_TITLE_MAX_LENGTH],
    ["seoTitleEn", CATEGORY_SEO_TITLE_MAX_LENGTH],
    ["seoDescriptionEs", CATEGORY_SEO_DESCRIPTION_MAX_LENGTH],
    ["seoDescriptionEn", CATEGORY_SEO_DESCRIPTION_MAX_LENGTH],
    ["coverAltEs", COVER_ALT_MAX_LENGTH],
    ["coverAltEn", COVER_ALT_MAX_LENGTH],
  ])("takes %s up to %i characters and refuses one more", (field, max) => {
    expect(
      updateCategoryPageSchema.safeParse(
        makePageInput({ [field]: "x".repeat(max) })
      ).success
    ).toBe(true);
    expect(
      updateCategoryPageSchema.safeParse(
        makePageInput({ [field]: "x".repeat(max + 1) })
      ).success
    ).toBe(false);
  });

  test.each([
    ["a group sent as text", { parentId: "6" }],
    ["group 0", { parentId: 0 }],
    ["a missing group", { parentId: undefined }],
  ])("refuses %s", (_case, overrides) => {
    expect(
      updateCategoryPageSchema.safeParse(makePageInput(overrides)).success
    ).toBe(false);
  });

  test("takes a group by its id", () => {
    expect(
      updateCategoryPageSchema.parse(makePageInput({ parentId: 6 })).parentId
    ).toBe(6);
  });

  test.each([
    [true, true],
    [false, false],
    [undefined, undefined],
  ])(
    "takes the header choice %j as %j: left out, the stored one stays (FER-051)",
    (showInHeader, expected) => {
      expect(
        updateCategoryPageSchema.parse(makePageInput({ showInHeader }))
          .showInHeader
      ).toBe(expected);
    }
  );

  test.each([["false"], [1], [null]])(
    "refuses a header choice of %j",
    (showInHeader) => {
      expect(
        updateCategoryPageSchema.safeParse(makePageInput({ showInHeader }))
          .success
      ).toBe(false);
    }
  );
});

describe("createCategoryPageFormSchema", () => {
  const MESSAGES = {
    altTooLong: "Alt too long",
    descriptionTooLong: "Description too long",
    titleTooLong: "Title too long",
  };
  const schema = createCategoryPageFormSchema(MESSAGES, { english: true });
  const messagesOf = (input: unknown, english = true) =>
    createCategoryPageFormSchema(MESSAGES, { english })
      .safeParse(input)
      .error?.issues.map((issue) => [issue.path.join("."), issue.message]);
  const form = (overrides: Record<string, unknown> = {}) =>
    makePageInput({
      cover: null,
      coverPhone: null,
      id: undefined,
      parentId: "",
      showInHeader: true,
      ...overrides,
    });

  test.each([
    [{ seoTitleEs: "x".repeat(71) }, [["seoTitleEs", "Title too long"]]],
    [
      { seoDescriptionEn: "x".repeat(161) },
      [["seoDescriptionEn", "Description too long"]],
    ],
    [{ coverAltEs: "x".repeat(201) }, [["coverAltEs", "Alt too long"]]],
    [{ seoTitleEs: "x".repeat(70), parentId: "12" }, undefined],
  ])("%j shows %j", (overrides, expected) => {
    expect(messagesOf(form(overrides))).toEqual(expected);
  });

  test("refuses a group that is not an id", () => {
    expect(schema.safeParse(form({ parentId: "abc" })).success).toBe(false);
  });

  test.each([
    [false, true],
    ["false", false],
    [undefined, false],
  ])("holds the header choice %j: %s", (showInHeader, accepted) => {
    const parsed = schema.safeParse(form({ showInHeader }));

    // Accepted, the choice comes out as it went in, never another value.
    expect(parsed.success ? parsed.data.showInHeader : "refused").toBe(
      accepted ? showInHeader : "refused"
    );
  });

  test.each([
    [
      "a cover from before uploads, kept as it is",
      { url: "/seed/a.jpg" },
      true,
    ],
    ["an image with no size", { width: 0 }, false],
    ["an image with no address", { url: "" }, false],
  ])("holds %s: %s", (_case, overrides, accepted) => {
    expect(
      schema.safeParse(
        form({
          cover: { height: 800, url: "/seed/b.jpg", width: 1200, ...overrides },
        })
      ).success
    ).toBe(accepted);
  });

  // Without an English name the English texts are shut and sent as none:
  // what they still hold cannot block the save, the Spanish limits still do.
  test.each([
    [{ seoTitleEn: "x".repeat(71) }, undefined],
    [{ seoDescriptionEn: "x".repeat(161) }, undefined],
    [{ coverAltEn: "x".repeat(201) }, undefined],
    [{ seoTitleEs: "x".repeat(71) }, [["seoTitleEs", "Title too long"]]],
  ])("without English, %j shows %j", (overrides, expected) => {
    expect(messagesOf(form(overrides), false)).toEqual(expected);
  });
});

/** `count` filters of `values` value slugs each, all of them valid. */
function makeFilters(count: number, values = 1) {
  return Array.from({ length: count }, (_, index) => ({
    attribute: `filtro-${String(index)}`,
    values: Array.from(
      { length: values },
      (_value, valueIndex) => `valor-${String(valueIndex)}`
    ),
  }));
}

describe("catalogFiltersSchema", () => {
  test.each([
    ["no filters", [], true],
    ["10 filters", makeFilters(10), true],
    ["11 filters", makeFilters(11), false],
    ["a filter with 20 values", makeFilters(1, 20), true],
    ["a filter with 21 values", makeFilters(1, 21), false],
    ["a filter with no values", makeFilters(1, 0), false],
    [
      "a filter slug with capitals",
      [{ attribute: "Color", values: ["rojo"] }],
      false,
    ],
    [
      "a value slug with a space",
      [{ attribute: "color", values: ["oro rosa"] }],
      false,
    ],
    ["an empty value slug", [{ attribute: "color", values: [""] }], false],
  ])("%s is accepted: %s", (_case, filters, accepted) => {
    expect(catalogFiltersSchema.safeParse(filters).success).toBe(accepted);
  });

  test("lists articles with the filters as given, trimmed", () => {
    expect(
      listProductsSchema.parse({
        filters: [{ attribute: " color ", values: ["dorado", " oro-rosa "] }],
        locale: "es",
      }).filters
    ).toEqual([{ attribute: "color", values: ["dorado", "oro-rosa"] }]);
  });
});

describe("listCatalogFiltersSchema", () => {
  test.each([
    [{ locale: "en" }, true],
    [{ locale: "fr" }, false],
    [{}, false],
  ])("%j is accepted: %s", (input, accepted) => {
    expect(listCatalogFiltersSchema.safeParse(input).success).toBe(accepted);
  });
});

describe("SWATCH_COLOR_PATTERN", () => {
  test.each([
    ["#d4af37", true],
    ["#D4AF37", false],
    ["#d4af3", false],
    ["#d4af377", false],
    ["d4af37", false],
    ["#g4af37", false],
  ])("%s matches: %s", (color, matches) => {
    expect(SWATCH_COLOR_PATTERN.test(color)).toBe(matches);
  });
});

function makeAttributeNames(overrides: Record<string, unknown> = {}) {
  return {
    nameEn: "Color",
    nameEs: "Color",
    ...overrides,
  };
}

describe("createAttributeSchema", () => {
  test("trims both names and keeps the English one", () => {
    expect(
      createAttributeSchema.parse(
        makeAttributeNames({ nameEn: " Colour ", nameEs: "  Color  " })
      )
    ).toEqual({ nameEn: "Colour", nameEs: "Color" });
  });

  test.each([
    ["blank", "   "],
    ["empty", ""],
    ["missing", null],
  ])("reads a %s English name as none", (_case, nameEn) => {
    expect(
      createAttributeSchema.parse(makeAttributeNames({ nameEn })).nameEn
    ).toBeNull();
  });

  test.each([
    ["a Spanish name of 60 characters", { nameEs: "x".repeat(60) }, true],
    ["a Spanish name of 61 characters", { nameEs: "x".repeat(61) }, false],
    [
      "a Spanish name of 60 between spaces",
      { nameEs: ` ${"x".repeat(60)} ` },
      true,
    ],
    ["a blank Spanish name", { nameEs: "   " }, false],
    ["no Spanish name", { nameEs: undefined }, false],
    ["an English name of 60 characters", { nameEn: "x".repeat(60) }, true],
    ["an English name of 61 characters", { nameEn: "x".repeat(61) }, false],
    ["no English field at all", { nameEn: undefined }, false],
    // A reserved word is a valid name: the service gives it another slug.
    ["a name that is a reserved slug", { nameEs: "category" }, true],
  ])("%s is accepted: %s", (_case, overrides, accepted) => {
    expect(
      createAttributeSchema.safeParse(makeAttributeNames(overrides)).success
    ).toBe(accepted);
  });
});

describe("store-scoped filter ids", () => {
  test("reads the ids from the path as numbers", () => {
    expect(
      renameAttributeSchema.parse(makeAttributeNames({ id: "5", nameEn: "" }))
    ).toEqual({
      id: 5,
      nameEn: null,
      nameEs: "Color",
    });
    expect(deleteAttributeSchema.parse({ id: "5" })).toEqual({ id: 5 });
    expect(deleteAttributeValueSchema.parse({ id: "6" })).toEqual({ id: 6 });
  });

  test.each([
    ["", false],
    ["0", false],
    ["2147483647", true],
    ["2147483648", false],
  ])("an id of %j is accepted: %s", (id, accepted) => {
    expect([
      renameAttributeSchema.safeParse(makeAttributeNames({ id })).success,
      deleteAttributeSchema.safeParse({ id }).success,
      deleteAttributeValueSchema.safeParse({ id }).success,
    ]).toEqual([accepted, accepted, accepted]);
  });
});

describe("reorderAttributesSchema and reorderAttributeValuesSchema", () => {
  test.each([
    [[3, 1, 2], true],
    [[1], true],
    [[1, 1], false],
    [[], false],
    [["1"], false],
    [[true], false],
    [[0], false],
  ])("ids %j are accepted: %s", (ids, accepted) => {
    expect([
      reorderAttributesSchema.safeParse({ ids }).success,
      reorderAttributeValuesSchema.safeParse({
        attributeId: 5,
        ids,
      }).success,
    ]).toEqual([accepted, accepted]);
  });

  test.each([
    [reorderAttributesSchema, { ids: [2, 2] }, "Each filter at most once"],
    [
      reorderAttributeValuesSchema,
      { attributeId: 5, ids: [2, 2] },
      "Each value at most once",
    ],
  ])("names a repeated id in its message: %#", (schema, input, message) => {
    expect(
      schema.safeParse({ ...input }).error?.issues.map((issue) => issue.message)
    ).toEqual([message]);
  });

  test.each([
    ["5", false],
    [true, false],
    [0, false],
    [5, true],
  ])("a filter id of %j is accepted: %s", (attributeId, accepted) => {
    expect(
      reorderAttributeValuesSchema.safeParse({
        attributeId,
        ids: [1],
      }).success
    ).toBe(accepted);
  });
});

function makeValue(overrides: Record<string, unknown> = {}) {
  return {
    attributeId: 5,
    nameEn: "Gold",
    nameEs: "Dorado",
    swatchColor: "#d4af37",
    ...overrides,
  };
}

describe("createAttributeValueSchema and updateAttributeValueSchema", () => {
  test.each([
    ["#d4af37", "#d4af37"],
    ["#D4AF37", "#d4af37"],
    [" #D4af37 ", "#d4af37"],
    [null, null],
  ])("reads a swatch of %j as %j", (swatchColor, expected) => {
    expect([
      createAttributeValueSchema.parse(makeValue({ swatchColor })).swatchColor,
      updateAttributeValueSchema.parse(
        makeValue({ attributeId: undefined, id: "21", swatchColor })
      ).swatchColor,
    ]).toEqual([expected, expected]);
  });

  test.each([
    ["no #", "d4af37"],
    ["five digits", "#d4af3"],
    ["seven digits", "#d4af377"],
    ["a non-hex digit", "#g4af37"],
    ["a name", "gold"],
    ["empty", ""],
    ["missing", undefined],
  ])("refuses a swatch with %s", (_case, swatchColor) => {
    expect(
      createAttributeValueSchema.safeParse(makeValue({ swatchColor })).success
    ).toBe(false);
  });

  test("trims the names and reads an empty English one as none", () => {
    expect(
      createAttributeValueSchema.parse(
        makeValue({ nameEn: "", nameEs: " Dorado " })
      )
    ).toEqual({
      attributeId: 5,
      nameEn: null,
      nameEs: "Dorado",
      swatchColor: "#d4af37",
    });
  });

  test.each([
    [{ nameEs: "x".repeat(60) }, true],
    [{ nameEs: "x".repeat(61) }, false],
    [{ nameEn: "x".repeat(60) }, true],
    [{ nameEn: "x".repeat(61) }, false],
    [{ nameEs: "  " }, false],
    // The body's filter id is a number, never coerced from text or a flag.
    [{ attributeId: "5" }, false],
    [{ attributeId: true }, false],
    [{ attributeId: 2_147_483_648 }, false],
  ])("a value with %j is accepted: %s", (overrides, accepted) => {
    expect(
      createAttributeValueSchema.safeParse(makeValue(overrides)).success
    ).toBe(accepted);
  });

  test("reads the value's id from the path", () => {
    expect(
      updateAttributeValueSchema.parse(
        makeValue({ attributeId: undefined, id: "21", swatchColor: null })
      )
    ).toEqual({
      id: 21,
      nameEn: "Gold",
      nameEs: "Dorado",
      swatchColor: null,
    });
  });
});

describe("createAttributeFormSchema", () => {
  const schema = createAttributeFormSchema({
    nameRequired: "Write the name",
    nameTooLong: "Too long",
  });
  const messagesOf = (input: unknown) =>
    schema
      .safeParse(input)
      .error?.issues.map((issue) => [issue.path.join("."), issue.message]);

  test.each([
    [
      { nameEn: "", nameEs: "  ", swatchColor: "" },
      [["nameEs", "Write the name"]],
    ],
    [
      { nameEn: "x".repeat(61), nameEs: "Dorado", swatchColor: "" },
      [["nameEn", "Too long"]],
    ],
    [
      { nameEn: "x".repeat(60), nameEs: "x".repeat(60), swatchColor: "" },
      undefined,
    ],
  ])("%j shows %j", (input, expected) => {
    expect(messagesOf(input)).toEqual(expected);
  });

  test.each([
    ["", true],
    ["#d4af37", true],
    // The color input always gives lowercase: anything else is not from it.
    ["#D4AF37", false],
    ["#d4af3", false],
    ["gold", false],
  ])("a swatch of %j is accepted: %s", (swatchColor, accepted) => {
    expect(
      schema.safeParse({ nameEn: "", nameEs: "Dorado", swatchColor }).success
    ).toBe(accepted);
  });

  test("keeps the swatch and a blank English name as typed", () => {
    expect(
      schema.parse({ nameEn: "  ", nameEs: " Dorado ", swatchColor: "#d4af37" })
    ).toEqual({ nameEn: "", nameEs: "Dorado", swatchColor: "#d4af37" });
  });
});

describe("productCursorSchema", () => {
  const PUBLISHED = "2026-11-15T10:00:00.000Z";
  const NEWEST = { publishedAt: PUBLISHED, sort: "newest" };
  const ASC = { sort: "price_asc" };

  test.each<[string, Record<string, unknown>, boolean]>([
    ["the store's order's key", { position: 12, sort: "position" }, true],
    ["a position of 0", { position: 0, sort: "position" }, true],
    ["a negative position", { position: -1, sort: "position" }, false],
    [
      "a position past int4",
      { position: 2_147_483_648, sort: "position" },
      false,
    ],
    ["an empty position", { position: "", sort: "position" }, false],
    ["neither key, the store's order", { sort: "position" }, false],
    [
      "the store's order with a price",
      { priceAmount: 69_000, sort: "position" },
      false,
    ],
    [
      "both keys, the store's order",
      { position: 12, priceAmount: 69_000, sort: "position" },
      false,
    ],
    ["by price with a position", { ...ASC, position: 12 }, false],
    ["newest with a position", { ...NEWEST, position: 12 }, false],
    ["the newest order's key", NEWEST, true],
    ["a price order's key", { ...ASC, priceAmount: 69_000 }, true],
    [
      "the other price order's key",
      { priceAmount: 69_000, sort: "price_desc" },
      true,
    ],
    ["a price of 0", { ...ASC, priceAmount: 0 }, true],
    ["the largest price", { ...ASC, priceAmount: 2_147_483_647 }, true],
    ["a price past int4", { ...ASC, priceAmount: 2_147_483_648 }, false],
    ["a negative price", { ...ASC, priceAmount: -1 }, false],
    ["a fractional price", { ...ASC, priceAmount: 1.5 }, false],
    // `Number("")` and `Number(" ")` are 0: empty text is no price at all.
    ["an empty price", { ...ASC, priceAmount: "" }, false],
    ["a blank price", { ...ASC, priceAmount: " " }, false],
    ["a price sent as true", { ...ASC, priceAmount: true }, false],
    ["a price that is not a number", { ...ASC, priceAmount: "12abc" }, false],
    ["both keys, newest", { ...NEWEST, priceAmount: 69_000 }, false],
    [
      "both keys, by price",
      { ...ASC, priceAmount: 69_000, publishedAt: PUBLISHED },
      false,
    ],
    ["neither key, newest", { sort: "newest" }, false],
    ["neither key, by price", ASC, false],
    // The key of another sort than the one it names.
    ["newest with a price", { priceAmount: 69_000, sort: "newest" }, false],
    ["by price with a date", { ...ASC, publishedAt: PUBLISHED }, false],
    // Without its sort a price cannot say which way it was read.
    ["no sort", { priceAmount: 69_000 }, false],
    ["an unknown sort", { priceAmount: 69_000, sort: "price" }, false],
  ])("a cursor with %s is accepted: %s", (_case, keys, accepted) => {
    expect(productCursorSchema.safeParse({ id: 3, ...keys }).success).toBe(
      accepted
    );
  });

  test.each(PRODUCT_SORTS)("keeps the sort %s it was made by", (sort) => {
    const keys = {
      newest: { publishedAt: PUBLISHED },
      position: { position: 7 },
      price_asc: { priceAmount: 500 },
      price_desc: { priceAmount: 500 },
    };
    const key = keys[sort];

    expect(productCursorSchema.parse({ id: 3, sort, ...key })).toEqual({
      id: 3,
      sort,
      ...key,
    });
  });

  test("reads a price from the query string as a number", () => {
    expect(
      productCursorSchema.parse({
        id: "3",
        priceAmount: "69000",
        sort: "price_desc",
      })
    ).toEqual({
      id: 3,
      priceAmount: 69_000,
      sort: "price_desc",
    });
  });

  test("explains a cursor without its sort's key", () => {
    expect(
      productCursorSchema
        .safeParse({ id: 3, priceAmount: 1, sort: "newest" })
        .error?.issues.map((issue) => issue.message)
    ).toEqual(["A cursor carries its sort's key, and only it"]);
  });
});
