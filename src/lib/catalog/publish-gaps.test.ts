import { describe, expect, test } from "vitest";

import {
  PUBLISH_GAPS,
  publishRefusalMessage,
  readPublishRefusal,
  resolvePublishGaps,
} from "./publish-gaps";

describe("resolvePublishGaps", () => {
  const ready = {
    categoryId: 9,
    imageCount: 1,
    priceAmount: 0,
    translations: [{ locale: "es" as const, title: "Collar" }],
  };

  test.each([
    ["nothing for a ready article", {}, []],
    ["the image", { imageCount: 0 }, ["image"]],
    ["the category", { categoryId: null }, ["category"]],
    ["the price", { priceAmount: null }, ["price"]],
    [
      "the Spanish title when only English has one",
      { translations: [{ locale: "en" as const, title: "Necklace" }] },
      ["spanishTitle"],
    ],
    [
      "the Spanish title of a blank draft",
      { translations: [{ locale: "es" as const, title: "" }] },
      ["spanishTitle"],
    ],
    [
      "the Spanish title when it is only spaces",
      { translations: [{ locale: "es" as const, title: "   " }] },
      ["spanishTitle"],
    ],
    [
      "the English title when its texts have none",
      {
        translations: [
          { locale: "es" as const, title: "Collar" },
          { locale: "en" as const, title: " " },
        ],
      },
      ["englishTitle"],
    ],
    [
      "nothing for English titled beside Spanish",
      {
        translations: [
          { locale: "es" as const, title: "Collar" },
          { locale: "en" as const, title: "Necklace" },
        ],
      },
      [],
    ],
    [
      "everything, in order",
      {
        categoryId: null,
        imageCount: 0,
        priceAmount: null,
        translations: [{ locale: "en" as const, title: "" }],
      },
      ["image", "category", "price", "spanishTitle", "englishTitle"],
    ],
  ])("names %s", (_name, overrides, expected) => {
    expect(resolvePublishGaps({ ...ready, ...overrides })).toEqual(expected);
  });
});

describe("PUBLISH_GAPS", () => {
  test("lists every gap in the order the rule names them", () => {
    expect(PUBLISH_GAPS).toEqual([
      "image",
      "category",
      "price",
      "spanishTitle",
      "englishTitle",
    ]);
  });
});

describe("publishRefusalMessage and readPublishRefusal", () => {
  test.each([
    ["one gap", ["price"]],
    ["every gap", [...PUBLISH_GAPS]],
  ] as const)("read back what they wrote: %s", (_case, gaps) => {
    const message = publishRefusalMessage(gaps);

    expect(message).toBe(
      `The article cannot be published yet. Missing: ${gaps.join(", ")}`
    );
    expect(readPublishRefusal(message)).toEqual(gaps);
  });

  test("reads the gaps in the rule's order, leaving out names it does not know", () => {
    expect(
      readPublishRefusal(
        "The article cannot be published yet. Missing: price, colour, image"
      )
    ).toEqual(["image", "price"]);
  });

  test.each([
    ["another refusal", "Article not found"],
    ["the gaps without the refusal's words", "Missing: price"],
    [
      "a refusal naming no known gap",
      "The article cannot be published yet. Missing: colour",
    ],
  ])("answers null for %s", (_case, message) => {
    expect(readPublishRefusal(message)).toBeNull();
  });
});
