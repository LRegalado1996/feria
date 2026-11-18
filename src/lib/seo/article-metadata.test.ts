import { describe, expect, test } from "vitest";

import {
  articleSearchTexts,
  excerpt,
  SEARCH_DESCRIPTION_MAX,
} from "./article-metadata";

function makeArticle(
  overrides: Partial<Parameters<typeof articleSearchTexts>[0]> = {}
) {
  return {
    description: "Plata 925, hecho a mano.",
    seoDescription: null,
    seoTitle: null,
    title: "Anillo de plata",
    ...overrides,
  };
}

const STORE = { name: "LR Market", tagline: "Bijouterie en la feria." };

describe("excerpt", () => {
  test.each([
    ["keeps a short text whole", "Plata 925.", "Plata 925."],
    [
      "joins its lines and spaces into one",
      "Plata\n\n925   hecha\ta mano.",
      "Plata 925 hecha a mano.",
    ],
    [
      "keeps a text of exactly the limit whole",
      "a".repeat(SEARCH_DESCRIPTION_MAX),
      "a".repeat(SEARCH_DESCRIPTION_MAX),
    ],
    [
      "cuts one past the limit at the last word, with an ellipsis",
      `${"palabra ".repeat(20)}x`,
      `${"palabra ".repeat(19).trim()}…`,
    ],
    [
      "cuts a text with no space where it must",
      "a".repeat(SEARCH_DESCRIPTION_MAX + 1),
      `${"a".repeat(SEARCH_DESCRIPTION_MAX - 1)}…`,
    ],
  ])("%s", (_case, text, expected) => {
    expect(excerpt(text)).toBe(expected);
  });
});

describe("articleSearchTexts", () => {
  test("prefers the article's own search title and description", () => {
    expect(
      articleSearchTexts(
        makeArticle({
          seoDescription: "El anillo que buscabas.",
          seoTitle: "Anillo 925",
        }),
        STORE
      )
    ).toEqual({
      description: "El anillo que buscabas.",
      pageTitle: "Anillo 925 · LR Market",
      title: "Anillo 925",
    });
  });

  test("falls back to the title and the start of the description", () => {
    expect(articleSearchTexts(makeArticle(), STORE)).toEqual({
      description: "Plata 925, hecho a mano.",
      pageTitle: "Anillo de plata · LR Market",
      title: "Anillo de plata",
    });
  });

  test.each([
    ["the store's tagline", STORE.tagline, STORE.tagline],
    ["nothing when the store has none either", undefined, undefined],
  ])(
    "describes an article without a description by %s",
    (_case, tagline, expected) => {
      expect(
        articleSearchTexts(makeArticle({ description: "" }), {
          ...STORE,
          tagline,
        }).description
      ).toBe(expected);
    }
  );
});
