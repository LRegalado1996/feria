import { describe, expect, test } from "vitest";

import { createProductFormSchema } from "@/lib/schemas/catalog";
import {
  makeProductForm,
  makeStoreProduct,
} from "@/test/factories/store-product";
import { required } from "@/test/required";

import {
  emptyProductForm,
  formPublishGaps,
  hasTexts,
  productFormValues,
  sameProduct,
  toProductValues,
} from "./product-form";

const BLANK = { description: "", title: "" };

describe("emptyProductForm", () => {
  test("starts with no photo, no texts, no price, available", () => {
    expect(emptyProductForm()).toEqual({
      attributeValueIds: [],
      categoryId: "",
      en: BLANK,
      es: BLANK,
      images: [],
      isAvailable: true,
      price: null,
    });
  });

  test("hands out a fresh object each time", () => {
    const first = emptyProductForm();
    first.es.title = "Collar";

    expect(emptyProductForm().es.title).toBe("");
  });
});

describe("productFormValues", () => {
  test("restores every field of a stored article, the price in whole units, its old search texts left behind", () => {
    const article = makeStoreProduct({
      translations: [
        {
          description: "Plata.",
          locale: "es",
          seoDescription: "Anillo 925",
          seoTitle: "Anillo",
          title: "Anillo de plata",
        },
        {
          description: "Silver.",
          locale: "en",
          seoDescription: null,
          seoTitle: null,
          title: "Silver ring",
        },
      ],
    });

    expect(productFormValues(article)).toEqual({
      attributeValueIds: [31],
      categoryId: "4",
      en: { description: "Silver.", title: "Silver ring" },
      es: { description: "Plata.", title: "Anillo de plata" },
      images: [
        {
          height: 900,
          url: "https://store.public.blob.vercel-storage.com/local/product/11111111-1111-4111-8111-111111111111.webp",
          width: 900,
        },
      ],
      isAvailable: true,
      price: 1290,
    });
  });

  test("leaves a blank draft blank: no category, no price, no English", () => {
    const values = productFormValues(
      makeStoreProduct({ categoryId: null, priceAmount: null })
    );

    expect(values).toMatchObject({ categoryId: "", en: BLANK, price: null });
  });

  test("reads cents as a decimal price", () => {
    expect(
      productFormValues(makeStoreProduct({ priceAmount: 1250 })).price
    ).toBe(12.5);
  });
});

describe("hasTexts", () => {
  test.each([
    ["nothing", BLANK, false],
    ["only spaces", { ...BLANK, description: "   " }, false],
    ["a title", { ...BLANK, title: "Ring" }, true],
    ["only a description", { ...BLANK, description: "x" }, true],
  ])("is %s → %s", (_case, texts, expected) => {
    expect(hasTexts(texts)).toBe(expected);
  });
});

describe("toProductValues", () => {
  test("sends the price in cents, the category as a number, the values as tapped and Spanish alone", () => {
    expect(
      toProductValues(
        makeProductForm({
          attributeValueIds: [9, 3, 31],
          es: { description: "  Plata 925. ", title: " Anillo " },
          price: 12.5,
        })
      )
    ).toEqual({
      attributeValueIds: [9, 3, 31],
      categoryId: 4,
      images: [
        {
          height: 900,
          url: "https://store.public.blob.vercel-storage.com/local/product/11111111-1111-4111-8111-111111111111.webp",
          width: 900,
        },
      ],
      isAvailable: true,
      priceAmount: 1250,
      translations: [
        {
          description: "Plata 925.",
          locale: "es",
          seoDescription: null,
          seoTitle: null,
          title: "Anillo",
        },
      ],
    });
  });

  test("sends no category and no price when the form has none", () => {
    expect(
      toProductValues(makeProductForm({ categoryId: "", price: null }))
    ).toMatchObject({ categoryId: null, priceAmount: null });
  });

  test("rounds away float noise in the cents, never a real decimal", () => {
    expect(toProductValues(makeProductForm({ price: 0.29 })).priceAmount).toBe(
      29
    );
  });

  test("sends English after Spanish once any English text is typed, never a search text", () => {
    const values = toProductValues(
      makeProductForm({ en: { ...BLANK, description: "Silver." } })
    );

    expect(values.translations).toEqual([
      {
        description: "Plata 925.",
        locale: "es",
        seoDescription: null,
        seoTitle: null,
        title: "Anillo de plata",
      },
      {
        description: "Silver.",
        locale: "en",
        seoDescription: null,
        seoTitle: null,
        title: "",
      },
    ]);
  });
});

describe("formPublishGaps", () => {
  test("names nothing for a ready article", () => {
    expect(formPublishGaps(makeProductForm())).toEqual([]);
  });

  test("names every gap of a blank draft, the English title once English is typed", () => {
    expect(
      formPublishGaps({
        ...emptyProductForm(),
        en: { ...BLANK, description: "Silver." },
      })
    ).toEqual(["image", "category", "price", "spanishTitle", "englishTitle"]);
  });

  test("asks for no English title while English is blank", () => {
    expect(formPublishGaps(makeProductForm({ en: BLANK }))).toEqual([]);
  });
});

describe("sameProduct", () => {
  test.each([
    ["the same article", makeProductForm(), true],
    [
      "spaces around a title",
      makeProductForm({
        es: { ...makeProductForm().es, title: " Anillo de plata " },
      }),
      true,
    ],
    ["another price", makeProductForm({ price: 1300 }), false],
    [
      "another filter value",
      makeProductForm({ attributeValueIds: [32] }),
      false,
    ],
    [
      "one filter value more",
      makeProductForm({ attributeValueIds: [31, 32] }),
      false,
    ],
    ["one photo fewer", makeProductForm({ images: [] }), false],
  ])("compares %s → %s", (_case, other, expected) => {
    expect(sameProduct(makeProductForm(), other)).toBe(expected);
  });
});

test("sameProduct tells the same two photos in another order apart", () => {
  const first = required(makeProductForm().images[0]);
  const second = {
    height: 600,
    url: "https://store.public.blob.vercel-storage.com/local/product/22222222-2222-4222-8222-222222222222.webp",
    width: 800,
  };

  expect(
    sameProduct(
      makeProductForm({ images: [first, second] }),
      makeProductForm({ images: [second, first] })
    )
  ).toBe(false);
});

test("sameProduct ignores the order filter values were tapped in", () => {
  expect(
    sameProduct(
      makeProductForm({ attributeValueIds: [31, 9] }),
      makeProductForm({ attributeValueIds: [9, 31] })
    )
  ).toBe(true);
});

describe("createProductFormSchema", () => {
  const MESSAGES = {
    descriptionTooLong: "description too long",
    priceDecimals: "two decimals",
    priceNegative: "negative",
    priceTooHigh: "too high",
    titleTooLong: "title too long",
  };

  function messageFor(values: unknown) {
    const parsed = createProductFormSchema(MESSAGES).safeParse(values);
    return parsed.success ? null : parsed.error.issues[0]?.message;
  }

  test.each([
    ["a ready article", makeProductForm(), null],
    ["a blank draft", emptyProductForm(), null],
    ["a free article", makeProductForm({ price: 0 }), null],
    ["a negative price", makeProductForm({ price: -1 }), "negative"],
    ["two decimals", makeProductForm({ price: 12.99 }), null],
    ["three decimals", makeProductForm({ price: 12.999 }), "two decimals"],
    ["the highest price", makeProductForm({ price: 999_999.99 }), null],
    ["a cent past it", makeProductForm({ price: 1_000_000 }), "too high"],
    [
      "a title of 120",
      makeProductForm({ es: { ...BLANK, title: "a".repeat(120) } }),
      null,
    ],
    [
      "a title of 121",
      makeProductForm({ es: { ...BLANK, title: "a".repeat(121) } }),
      "title too long",
    ],
    [
      "a description of 4001",
      makeProductForm({ es: { ...BLANK, description: "a".repeat(4001) } }),
      "description too long",
    ],
  ])("reads %s → %s", (_case, values, expected) => {
    expect(messageFor(values)).toBe(expected);
  });

  test("keeps no search texts, even from a copy saved before they went", () => {
    // As a published article's changes kept in this browser hold them.
    const kept = {
      description: "Plata.",
      seoTitle: "Anillo 925",
      title: "Anillo",
    };
    const parsed = createProductFormSchema().parse(
      makeProductForm({ es: kept })
    );

    expect(parsed.es).toEqual({ description: "Plata.", title: "Anillo" });
  });

  test("refuses a ninth photo and a category that is not an id", () => {
    const photo = { height: 1, url: "/seed/a.jpg", width: 1 };

    expect(
      createProductFormSchema().safeParse(
        makeProductForm({ images: Array.from({ length: 9 }, () => photo) })
      ).success
    ).toBe(false);
    expect(
      createProductFormSchema().safeParse(makeProductForm({ categoryId: "x" }))
        .success
    ).toBe(false);
  });
});
