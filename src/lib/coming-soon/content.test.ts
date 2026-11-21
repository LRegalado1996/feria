import { describe, expect, test } from "vitest";

import { en } from "@/content/en";
import { es } from "@/content/es";
import { FAIR_OPENS_AT } from "@/lib/brand/fair";

import {
  resolveComingSoonContent,
  type StoredComingSoon,
  type StoreSocialLinks,
} from "./content";

type Texts = StoredComingSoon["translations"][number];

function makeTexts(overrides: Partial<Texts> = {}): Texts {
  return {
    eyebrow: null,
    headline: null,
    lead: null,
    locale: "es",
    marquee: null,
    ...overrides,
  };
}

function makeStored(
  overrides: Partial<StoredComingSoon> = {}
): StoredComingSoon {
  return { countdownTo: null, translations: [], ...overrides };
}

/** The brand's own profiles, what the page links when the store has none. */
const BRAND_SOCIAL = {
  instagram: "https://www.instagram.com/lrmarket",
  tiktok: "https://www.tiktok.com/@lrmarket",
};

const NO_LINKS: StoreSocialLinks = { instagramUrl: null, tiktokUrl: null };

describe("resolveComingSoonContent", () => {
  test.each([
    [
      "es",
      es.comingSoon,
      {
        eyebrow: "Feria navideña · 5 de diciembre al 5 de enero",
        headline: ["Muy", "pronto"],
        lead: "Bijou y pistolas de burbujas. Estamos armando la tienda: seguinos y enterate cuando abra.",
        marquee: [
          "LR Market",
          "Bijou y pistolas de burbujas",
          "Feria navideña",
          "5 dic al 5 ene",
        ],
      },
    ],
    [
      "en",
      en.comingSoon,
      {
        eyebrow: "Christmas fair · December 5 to January 5",
        headline: ["Opening", "soon"],
        lead: "Jewelry and bubble guns. We are setting up the store: follow us and find out when it opens.",
        marquee: [
          "LR Market",
          "Jewelry and bubble guns",
          "Christmas fair",
          "Dec 5 to Jan 5",
        ],
      },
    ],
  ] as const)(
    "with nothing saved, in %s, says the dictionary's page, counts to the fair and links the brand",
    (locale, copy, expected) => {
      expect(
        resolveComingSoonContent(copy, makeStored(), locale, NO_LINKS)
      ).toEqual({
        ...expected,
        opensAt: FAIR_OPENS_AT,
        social: BRAND_SOCIAL,
      });
    }
  );

  test("shows what was saved in the page's language, the brand first in the band", () => {
    expect(
      resolveComingSoonContent(
        es.comingSoon,
        makeStored({
          countdownTo: "2026-12-20",
          translations: [
            makeTexts({
              eyebrow: "Feria · del 20 de diciembre",
              headline: "Abrimos\nel sábado",
              lead: "Te esperamos.",
              marquee: "Bijou\nBurbujas",
            }),
          ],
        }),
        "es",
        NO_LINKS
      )
    ).toEqual({
      eyebrow: "Feria · del 20 de diciembre",
      headline: ["Abrimos", "el sábado"],
      lead: "Te esperamos.",
      marquee: ["LR Market", "Bijou", "Burbujas"],
      opensAt: new Date("2026-12-20T03:00:00.000Z"),
      social: BRAND_SOCIAL,
    });
  });

  test("falls back field by field: an empty text says the dictionary's, a saved one stays", () => {
    const content = resolveComingSoonContent(
      en.comingSoon,
      makeStored({
        translations: [makeTexts({ lead: "We open soon.", locale: "en" })],
      }),
      "en",
      NO_LINKS
    );

    expect(content.eyebrow).toBe("Christmas fair · December 5 to January 5");
    expect(content.headline).toEqual(["Opening", "soon"]);
    expect(content.lead).toBe("We open soon.");
    expect(content.marquee).toEqual([
      "LR Market",
      "Jewelry and bubble guns",
      "Christmas fair",
      "Dec 5 to Jan 5",
    ]);
  });

  test("never shows another language's text: an English reader of a Spanish-only page reads the English default", () => {
    const content = resolveComingSoonContent(
      en.comingSoon,
      makeStored({
        translations: [
          makeTexts({ eyebrow: "Feria", headline: "Abrimos", lead: "Hola" }),
        ],
      }),
      "en",
      NO_LINKS
    );

    expect(content.eyebrow).toBe(en.comingSoon.eyebrow);
    expect(content.headline).toEqual(["Opening", "soon"]);
    expect(content.lead).toBe(en.comingSoon.lead);
  });

  test("shows each line once, the brand included, since the lists key their items by their text", () => {
    const content = resolveComingSoonContent(
      es.comingSoon,
      makeStored({
        translations: [
          makeTexts({
            headline: "Hola\nHola",
            marquee: "LR Market\nBijou\nBijou",
          }),
        ],
      }),
      "es",
      NO_LINKS
    );

    expect(content.headline).toEqual(["Hola"]);
    expect(content.marquee).toEqual(["LR Market", "Bijou"]);
  });

  test.each([
    [
      "both of the store's links",
      {
        instagramUrl: "https://instagram.com/e2e-market",
        tiktokUrl: "https://tiktok.com/@e2e-market",
      },
      {
        instagram: "https://instagram.com/e2e-market",
        tiktok: "https://tiktok.com/@e2e-market",
      },
    ],
    [
      "the store's Instagram and the brand's TikTok, the store having none",
      { instagramUrl: "https://instagram.com/e2e-market", tiktokUrl: null },
      {
        instagram: "https://instagram.com/e2e-market",
        tiktok: BRAND_SOCIAL.tiktok,
      },
    ],
    [
      "the brand's Instagram and the store's TikTok, the store having only TikTok",
      { instagramUrl: null, tiktokUrl: "https://tiktok.com/@e2e-market" },
      {
        instagram: BRAND_SOCIAL.instagram,
        tiktok: "https://tiktok.com/@e2e-market",
      },
    ],
    ["the brand's, the store not readable", null, BRAND_SOCIAL],
  ] as const)("links %s", (_case, store, social) => {
    expect(
      resolveComingSoonContent(es.comingSoon, makeStored(), "es", store).social
    ).toEqual(social);
  });
});
