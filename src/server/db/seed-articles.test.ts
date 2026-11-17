import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { createProductSchema } from "@/lib/schemas/catalog";

import { inTurns, SEED_ARTICLES, SEED_PHOTOS } from "./seed-articles";
import { SEED_CATEGORIES, SEED_COLORS } from "./seed-catalog";

/** A photo of `public/seed/` by its file name. */
function seedFile(file: string) {
  return path.join(process.cwd(), "public/seed", file);
}

/**
 * A JPEG's size, from its first frame header (SOF0 to SOF3): what the
 * browser lays out, so the seed's width and height must match it.
 */
function jpegSize(file: string) {
  const bytes = readFileSync(seedFile(file));
  let offset = 2;

  while (offset + 9 < bytes.length) {
    const marker = bytes.readUInt16BE(offset);
    const length = bytes.readUInt16BE(offset + 2);

    if (marker >= 0xff_c0 && marker <= 0xff_c3) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return null;
}

describe("SEED_PHOTOS", () => {
  test("every photo is a JPEG in public/seed at most 1600 px wide, of the size the seed records", () => {
    const wrong = Object.entries(SEED_PHOTOS).flatMap(([file, photo]) => {
      const size = existsSync(seedFile(file)) ? jpegSize(file) : null;

      return size?.width === photo.width &&
        size.height === photo.height &&
        photo.width <= 1600
        ? []
        : [{ file, recorded: [photo.width, photo.height], size }];
    });

    expect(wrong).toEqual([]);
    // The eleven first photos (FER-010) and the twenty-eight of FER-044.
    expect(Object.keys(SEED_PHOTOS)).toHaveLength(39);
  });

  test("every photo is described in both languages", () => {
    expect(
      Object.entries(SEED_PHOTOS).filter(
        ([, photo]) => photo.alt.es.trim() === "" || photo.alt.en.trim() === ""
      )
    ).toEqual([]);
  });

  test("every photo is some article's", () => {
    const used = new Set(SEED_ARTICLES.flatMap((article) => article.images));

    expect(Object.keys(SEED_PHOTOS).filter((file) => !used.has(file))).toEqual(
      []
    );
  });
});

describe("SEED_ARTICLES", () => {
  test("holds about fifty articles in every leaf category, one sold out", () => {
    const counts = Object.fromEntries(
      SEED_CATEGORIES.map((entry) => [
        entry.slug,
        SEED_ARTICLES.filter((article) => article.category === entry.slug)
          .length,
      ])
    );

    expect(counts).toEqual({
      anillos: 12,
      aros: 11,
      bijouterie: 0,
      burbujeros: 7,
      cadenas: 9,
      pulseras: 10,
    });
    expect(
      SEED_ARTICLES.filter((article) => !article.isAvailable).map(
        (article) => article.title.es
      )
    ).toEqual(["Cadena corona"]);
  });

  test("gives at least six articles four or five photos, the bangle pair and a ring among them", () => {
    const galleries = SEED_ARTICLES.filter(
      (article) => article.images.length >= 4
    );

    expect(galleries.map((article) => article.title.es)).toEqual([
      "Cadena corazones",
      "Par de esclavas",
      "Burbujero pez",
      "Anillo halo",
      "Aros argolla gruesa",
      "Pulsera eslabones",
      "Cadena con chapita",
    ]);
    expect(galleries.every((article) => article.images.length <= 5)).toBe(true);
    // Never the same photo twice in one article.
    expect(
      SEED_ARTICLES.filter(
        (article) => new Set(article.images).size !== article.images.length
      )
    ).toEqual([]);
  });

  test("names every article once, in each language", () => {
    for (const locale of ["es", "en"] as const) {
      const titles = SEED_ARTICLES.map((article) => article.title[locale]);

      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  test("mixes the categories in the order they are created, the first one of each in turn", () => {
    expect(
      SEED_ARTICLES.slice(0, 6).map((article) => [
        article.category,
        article.title.es,
      ])
    ).toEqual([
      ["burbujeros", "Burbujero cristal"],
      ["cadenas", "Cadena corazones"],
      ["anillos", "Anillo solitario"],
      ["aros", "Aros abotonados"],
      ["pulseras", "Par de esclavas"],
      ["burbujeros", "Burbujero pez"],
    ]);
  });

  test.each(["es", "en"] as const)(
    "every %s description is three short paragraphs of one or two sentences",
    (locale) => {
      for (const article of SEED_ARTICLES) {
        const paragraphs = article.description[locale].split("\n\n");

        expect(paragraphs).toHaveLength(3);

        for (const paragraph of paragraphs) {
          const sentences = paragraph.match(/[.!?](?=\s|$)/gu) ?? [];

          expect(paragraph.trim()).toBe(paragraph);
          expect(sentences.length).toBeGreaterThanOrEqual(1);
          expect(sentences.length).toBeLessThanOrEqual(2);
        }
      }
    }
  );

  test("claims no material nobody checked: a tone, never a metal or a plating", () => {
    const claims =
      /\b(?:plata|oro(?! rosa)|baño|925|18k|silver plated|gold plated|sterling|solid gold|hipoalerg|hypoallergenic|acero|steel)\b/iu;

    expect(
      SEED_ARTICLES.flatMap((article) =>
        (["es", "en"] as const).flatMap((locale) =>
          claims.test(article.description[locale])
            ? [`${article.title.es} (${locale})`]
            : []
        )
      )
    ).toEqual([]);
  });

  test("every article passes the API's rules, in a seeded category, with seeded colors", () => {
    const slugs = new Set(SEED_CATEGORIES.map((entry) => entry.slug));
    const colors = new Set(SEED_COLORS.map((color) => color.slug));

    for (const article of SEED_ARTICLES) {
      expect(slugs.has(article.category)).toBe(true);
      expect(article.colors.length).toBeGreaterThan(0);
      expect(article.colors.filter((slug) => !colors.has(slug))).toEqual([]);
      expect(
        createProductSchema.safeParse({
          categoryId: 1,
          isAvailable: article.isAvailable,
          priceAmount: article.priceAmount,
          translations: (["es", "en"] as const).map((locale) => ({
            description: article.description[locale],
            locale,
            seoDescription: null,
            seoTitle: null,
            title: article.title[locale],
          })),
        }).success
      ).toBe(true);
    }
  });
});

describe("inTurns", () => {
  test("takes one of each list in turn while any has one left", () => {
    expect(inTurns([["a1", "a2", "a3"], ["b1"], [], ["c1", "c2"]])).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "c2",
      "a3",
    ]);
  });

  test("gives nothing for no lists", () => {
    expect(inTurns([])).toEqual([]);
  });
});
