import { describe, expect, test } from "vitest";

import {
  createCategoryFormSchema,
  createCategorySchema,
  createProductSchema,
  deleteCategorySchema,
  listProductsSchema,
  listRelatedProductsSchema,
  renameCategorySchema,
  reorderCategoriesSchema,
  reorderProductImagesSchema,
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

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: 1,
    isAvailable: true,
    priceAmount: 129_000,
    storeSlug: "lr-market",
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
    ["a blank title", { title: "   " }, false],
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
        storeSlug: "lr-market",
      })
    ).toEqual({
      limit: 24,
      locale: "es",
      q: undefined,
      storeSlug: "lr-market",
    });
  });

  test.each([
    [{ limit: 48 }, true],
    [{ limit: 49 }, false],
    [{ limit: 0 }, false],
    [{ q: "x".repeat(100) }, true],
    [{ q: "x".repeat(101) }, false],
    [{ category: "Cadenas Doradas" }, false],
    [{ category: "cadenas-doradas" }, true],
    [{ cursor: { id: 3, publishedAt: "2026-11-15T10:00:00.000Z" } }, true],
    [{ cursor: { id: 3, publishedAt: "yesterday" } }, false],
    [{ cursor: { id: 3, publishedAt: "0000-01-01T00:00:00.000Z" } }, false],
    [{ cursor: { id: 3, publishedAt: "0001-01-01T00:00:00.000Z" } }, true],
    [
      {
        cursor: { id: 2_147_483_647, publishedAt: "2026-11-15T10:00:00.000Z" },
      },
      true,
    ],
    [
      {
        cursor: { id: 2_147_483_648, publishedAt: "2026-11-15T10:00:00.000Z" },
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
        storeSlug: "lr-market",
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
        storeSlug: "lr-market",
      }).limit
    ).toBe(expected);
  });

  test("refuses more than 12", () => {
    expect(
      listRelatedProductsSchema.safeParse({
        limit: 13,
        locale: "es",
        slug: "cadena",
        storeSlug: "lr-market",
      }).success
    ).toBe(false);
  });
});

describe("reorderProductImagesSchema", () => {
  test.each([
    [[3, 1, 2], true],
    [[1, 1], false],
    [[], false],
    [[true], false],
  ])("image ids %j are accepted: %s", (imageIds, accepted) => {
    expect(
      reorderProductImagesSchema.safeParse({
        id: 1,
        imageIds,
        storeSlug: "lr-market",
      }).success
    ).toBe(accepted);
  });
});

function makeCategoryNames(overrides: Record<string, unknown> = {}) {
  return {
    nameEn: "Necklaces",
    nameEs: "Collares",
    storeSlug: "lr-market",
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
      storeSlug: "lr-market",
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
      storeSlug: "lr-market",
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
    expect(
      reorderCategoriesSchema.safeParse({ ids, storeSlug: "lr-market" }).success
    ).toBe(accepted);
  });

  test("names a repeated id in its message", () => {
    const parsed = reorderCategoriesSchema.safeParse({
      ids: [2, 2],
      storeSlug: "lr-market",
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
    expect(
      deleteCategorySchema.parse({ ...input, storeSlug: "lr-market" })
    ).toEqual({ ...expected, storeSlug: "lr-market" });
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
        storeSlug: "lr-market",
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
