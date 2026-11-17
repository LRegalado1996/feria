import { describe, expect, test } from "vitest";

import { en } from "@/content/en";
import { es } from "@/content/es";
import { formatPrice } from "@/lib/utils/format";

import { buildStoreLlms, type StoreLlmsInput } from "./llms";

const ORIGIN = "https://lrmarket.example";

function makeStore(overrides: Partial<StoreLlmsInput["store"]> = {}) {
  return {
    name: "LR Market",
    translations: [
      {
        description: "Bijou y pistolas de burbujas en Montevideo.",
        locale: "es" as const,
        tagline: "Bijou y burbujas",
      },
      {
        description: "Jewelry and bubble guns in Montevideo.",
        locale: "en" as const,
        tagline: "Jewelry and bubbles",
      },
    ],
    ...overrides,
  };
}

function makeArticle(
  overrides: Partial<StoreLlmsInput["articles"][number]> = {}
) {
  return {
    priceAmount: 69_000,
    slug: "anillo-sello",
    titles: [
      { locale: "es" as const, title: "Anillo sello" },
      { locale: "en" as const, title: "Signet ring" },
    ],
    ...overrides,
  };
}

function build(overrides: Partial<StoreLlmsInput> = {}) {
  const locale = overrides.locale ?? "es";

  return buildStoreLlms({
    articles: [makeArticle()],
    categories: [{ name: "Anillos", slug: "anillos" }],
    copy: (locale === "es" ? es : en).seo.llms,
    currencyCode: "UYU",
    locale,
    origin: ORIGIN,
    store: makeStore(),
    ...overrides,
  });
}

describe("buildStoreLlms", () => {
  test("writes the store in Spanish: H1, summary, description, categories, articles and the optional links", () => {
    expect(build()).toBe(
      [
        "# LR Market",
        "",
        "> Bijou y burbujas",
        "",
        "Bijou y pistolas de burbujas en Montevideo.",
        "",
        "## Categorías",
        "",
        `- [Anillos](${ORIGIN}/products?category=anillos)`,
        "",
        "## Artículos",
        "",
        `- [Anillo sello](${ORIGIN}/products/anillo-sello): ${formatPrice(69_000, "UYU", "es")}`,
        "",
        "## Optional",
        "",
        `- [Catálogo completo](${ORIGIN}/products)`,
        `- [English version](${ORIGIN}/en/llms.txt)`,
        "",
      ].join("\n")
    );
  });

  test("writes it in English under /en, pointing back at the Spanish file", () => {
    expect(build({ locale: "en" })).toBe(
      [
        "# LR Market",
        "",
        "> Jewelry and bubbles",
        "",
        "Jewelry and bubble guns in Montevideo.",
        "",
        "## Categories",
        "",
        `- [Anillos](${ORIGIN}/en/products?category=anillos)`,
        "",
        "## Articles",
        "",
        `- [Signet ring](${ORIGIN}/en/products/anillo-sello): ${formatPrice(69_000, "UYU", "en")}`,
        "",
        "## Optional",
        "",
        `- [Full catalog](${ORIGIN}/en/products)`,
        `- [Versión en español](${ORIGIN}/llms.txt)`,
        "",
      ].join("\n")
    );
  });

  test("prices in the store's currency, with the cents it has", () => {
    expect(
      build({
        articles: [makeArticle({ priceAmount: 129_050 })],
        currencyCode: "USD",
      })
    ).toContain(
      `/products/anillo-sello): ${formatPrice(129_050, "USD", "es")}\n`
    );
    expect(formatPrice(129_050, "USD", "es")).toMatch(/^US\$\s1\.290,50$/u);
  });

  test("falls back to the Spanish texts, and leaves out what a store does not have", () => {
    const text = build({
      articles: [
        makeArticle({
          priceAmount: null,
          slug: "cadena",
          titles: [{ locale: "es", title: "Cadena" }],
        }),
      ],
      categories: [],
      locale: "en",
      store: makeStore({
        translations: [
          { description: "  ", locale: "es", tagline: "Bijou\n y burbujas " },
        ],
      }),
    });

    expect(text).toBe(
      [
        "# LR Market",
        "",
        "> Bijou y burbujas",
        "",
        "## Articles",
        "",
        `- [Cadena](${ORIGIN}/en/products/cadena)`,
        "",
        "## Optional",
        "",
        `- [Full catalog](${ORIGIN}/en/products)`,
        `- [Versión en español](${ORIGIN}/llms.txt)`,
        "",
      ].join("\n")
    );
  });

  test("writes no summary, description or sections for a store with nothing to list", () => {
    expect(
      build({
        articles: [],
        categories: [],
        store: makeStore({ translations: [] }),
      })
    ).toBe(
      [
        "# LR Market",
        "",
        "## Optional",
        "",
        `- [Catálogo completo](${ORIGIN}/products)`,
        `- [English version](${ORIGIN}/en/llms.txt)`,
        "",
      ].join("\n")
    );
  });

  test("keeps a link's text on one line and its brackets literal", () => {
    expect(
      build({
        articles: [
          makeArticle({
            titles: [{ locale: "es", title: "Aros [edición]\n limitada" }],
          }),
        ],
        categories: [{ name: "Aros \\ dijes", slug: "aros" }],
      })
    ).toContain(
      `${String.raw`- [Aros \[edición\] limitada](`}${ORIGIN}/products/anillo-sello)`
    );
    expect(
      build({ categories: [{ name: "Aros \\ dijes", slug: "aros" }] })
    ).toContain(String.raw`- [Aros \\ dijes](`);
  });

  test("writes an article without any title as an empty link text", () => {
    expect(build({ articles: [makeArticle({ titles: [] })] })).toContain(
      `- [](${ORIGIN}/products/anillo-sello)`
    );
  });
});
