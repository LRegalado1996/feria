import { describe, expect, test } from "vitest";

import { storeMetadata, storeTitle } from "./store-metadata";

const TEXTS = [
  {
    description: "Joyas.",
    locale: "es" as const,
    location: null,
    tagline: "Joyas en la feria",
  },
  {
    description: "Jewelry.",
    locale: "en" as const,
    location: null,
    tagline: "Jewelry at the fair",
  },
];

function makeStore(translations = TEXTS) {
  return { name: "LR Market", translations };
}

describe("storeTitle", () => {
  test("puts the store's name after the page's own title", () => {
    expect(storeTitle("Tu carrito", "LR Market")).toBe(
      "Tu carrito · LR Market"
    );
  });
});

describe("storeMetadata", () => {
  test.each([
    ["es", "Joyas en la feria"],
    ["en", "Jewelry at the fair"],
  ] as const)(
    "in %s, describes the page with the store's tagline and shares it under the store's name",
    (locale, tagline) => {
      expect(storeMetadata(makeStore(), locale)).toEqual({
        description: tagline,
        openGraph: {
          description: tagline,
          siteName: "LR Market",
          type: "website",
        },
      });
    }
  );

  test("leaves the description out when the store has no texts yet", () => {
    expect(storeMetadata(makeStore([]), "es")).toEqual({
      description: undefined,
      openGraph: {
        description: undefined,
        siteName: "LR Market",
        type: "website",
      },
    });
  });
});
