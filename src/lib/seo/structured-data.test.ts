import { describe, expect, test } from "vitest";

import {
  breadcrumbList,
  collectionPage,
  itemList,
  productWithOffer,
  STORE_LOGO_PATH,
  storeOrganization,
  webSite,
} from "./structured-data";

function makeStore(
  overrides: Partial<Parameters<typeof storeOrganization>[0]> = {}
) {
  return {
    instagramUrl: null,
    logoUrl: null,
    name: "LR Market",
    tiktokUrl: null,
    url: "https://feria.example/lr-market",
    ...overrides,
  };
}

type ArticleFields = Parameters<typeof productWithOffer>[0];

function makeArticle(overrides: Partial<ArticleFields> = {}): ArticleFields {
  return {
    category: "Collares",
    currency: "UYU",
    description: "Cadena de plata 925.",
    images: [
      "https://cdn.example/cadena-1.webp",
      "https://cdn.example/cadena-2.webp",
    ],
    isAvailable: true,
    name: "Cadena",
    priceAmount: 120_000,
    sku: "CAD-001",
    storeName: "LR Market",
    url: "https://feria.example/lr-market/products/cadena",
    ...overrides,
  };
}

describe("storeOrganization: how to reach the store (FER-080)", () => {
  test("given its number, says it as a contact point in international format", () => {
    expect(
      storeOrganization(makeStore({ whatsappNumber: "+59899123456" }))
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: "+59899123456",
      },
      name: "LR Market",
      url: "https://feria.example/lr-market",
    });
  });

  test.each([[null], [undefined]])(
    "with %s for a number, names no contact point",
    (whatsappNumber) => {
      expect(
        storeOrganization(makeStore({ whatsappNumber }))
      ).not.toHaveProperty("contactPoint");
    }
  );
});

describe("storeOrganization", () => {
  test("names the store with its home, logo and every profile it has", () => {
    expect(
      storeOrganization(
        makeStore({
          instagramUrl: "https://instagram.com/lrmarket",
          logoUrl: "https://cdn.example/logo.png",
          tiktokUrl: "https://tiktok.com/@lrmarket",
        })
      )
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      logo: "https://cdn.example/logo.png",
      name: "LR Market",
      sameAs: [
        "https://instagram.com/lrmarket",
        "https://tiktok.com/@lrmarket",
      ],
      url: "https://feria.example/lr-market",
    });
  });

  test("lists only the profiles it has", () => {
    expect(
      storeOrganization(
        makeStore({ tiktokUrl: "https://tiktok.com/@lrmarket" })
      )
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "LR Market",
      sameAs: ["https://tiktok.com/@lrmarket"],
      url: "https://feria.example/lr-market",
    });
  });

  test("leaves out the logo and the profiles a store without them has", () => {
    expect(storeOrganization(makeStore())).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "LR Market",
      url: "https://feria.example/lr-market",
    });
  });
});

describe("breadcrumbList", () => {
  test("numbers the crumbs from 1, in the order given", () => {
    expect(
      breadcrumbList([
        { name: "LR Market", url: "https://feria.example/lr-market" },
        {
          name: "Cadena",
          url: "https://feria.example/lr-market/products/cadena",
        },
      ])
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: "https://feria.example/lr-market",
          name: "LR Market",
          position: 1,
        },
        {
          "@type": "ListItem",
          item: "https://feria.example/lr-market/products/cadena",
          name: "Cadena",
          position: 2,
        },
      ],
    });
  });
});

describe("collectionPage", () => {
  test("describes a catalog page, its trail and its first articles in their order", () => {
    const home = { name: "LR Market", url: "https://lr.example/" };
    const rings = {
      name: "Anillos",
      url: "https://lr.example/bijouterie/anillos",
    };

    expect(
      collectionPage({
        breadcrumb: [home, rings],
        description: "Comprá Anillos en LR Market.",
        items: [
          { name: "Anillo sello", url: "https://lr.example/products/sello" },
          { name: "Anillo flor", url: "https://lr.example/products/flor" },
        ],
        locale: "es",
        name: "Anillos",
        url: rings.url,
      })
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      breadcrumb: breadcrumbList([home, rings]),
      description: "Comprá Anillos en LR Market.",
      inLanguage: "es",
      mainEntity: {
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "ListItem",
            name: "Anillo sello",
            position: 1,
            url: "https://lr.example/products/sello",
          },
          {
            "@type": "ListItem",
            name: "Anillo flor",
            position: 2,
            url: "https://lr.example/products/flor",
          },
        ],
        numberOfItems: 2,
      },
      name: "Anillos",
      url: rings.url,
    });
  });

  test("lists nothing for a page without articles", () => {
    expect(
      collectionPage({
        breadcrumb: [],
        description: "",
        items: [],
        locale: "en",
        name: "Rings",
        url: "https://lr.example/en/anillos",
      }).mainEntity
    ).toEqual({ "@type": "ItemList", itemListElement: [], numberOfItems: 0 });
  });
});

describe("productWithOffer", () => {
  test("describes the article and its offer, the price in major units with two decimals", () => {
    expect(productWithOffer(makeArticle())).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      brand: { "@type": "Brand", name: "LR Market" },
      category: "Collares",
      description: "Cadena de plata 925.",
      image: [
        "https://cdn.example/cadena-1.webp",
        "https://cdn.example/cadena-2.webp",
      ],
      name: "Cadena",
      offers: {
        "@type": "Offer",
        availability: "https://schema.org/InStock",
        price: "1200.00",
        priceCurrency: "UYU",
        seller: { "@type": "Organization", name: "LR Market" },
        url: "https://feria.example/lr-market/products/cadena",
      },
      sku: "CAD-001",
      url: "https://feria.example/lr-market/products/cadena",
    });
  });

  test.each([
    [129_050, "1290.50"],
    [1, "0.01"],
    [0, "0.00"],
  ])("writes %i minor units as %s", (priceAmount, price) => {
    expect(productWithOffer(makeArticle({ priceAmount })).offers.price).toBe(
      price
    );
  });

  test.each([
    [true, "https://schema.org/InStock"],
    [false, "https://schema.org/OutOfStock"],
  ])("an article available %s is %s", (isAvailable, availability) => {
    expect(
      productWithOffer(makeArticle({ isAvailable })).offers.availability
    ).toBe(availability);
  });

  test("leaves out the description, the photos and the category it doesn't have", () => {
    expect(
      productWithOffer(
        makeArticle({ category: null, description: "", images: [] })
      )
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "Product",
      brand: { "@type": "Brand", name: "LR Market" },
      name: "Cadena",
      offers: {
        "@type": "Offer",
        availability: "https://schema.org/InStock",
        price: "1200.00",
        priceCurrency: "UYU",
        seller: { "@type": "Organization", name: "LR Market" },
        url: "https://feria.example/lr-market/products/cadena",
      },
      sku: "CAD-001",
      url: "https://feria.example/lr-market/products/cadena",
    });
  });
});

describe("webSite", () => {
  test("names the site with its home, in the page's language", () => {
    expect(
      webSite({
        locale: "en",
        name: "LR Market",
        url: "https://feria.example/en",
      })
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      inLanguage: "en",
      name: "LR Market",
      url: "https://feria.example/en",
    });
  });
});

describe("itemList", () => {
  test("lists a row's articles under its name, numbered from 1 in their order", () => {
    expect(
      itemList({
        items: [
          { name: "Anillo sello", url: "https://feria.example/productos/a" },
          { name: "Cadena", url: "https://feria.example/productos/c" },
        ],
        name: "Más vendidos",
      })
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "ListItem",
          name: "Anillo sello",
          position: 1,
          url: "https://feria.example/productos/a",
        },
        {
          "@type": "ListItem",
          name: "Cadena",
          position: 2,
          url: "https://feria.example/productos/c",
        },
      ],
      name: "Más vendidos",
      numberOfItems: 2,
    });
  });
});

test("the brand's logo is the full logo among the brand files the site serves", () => {
  expect(STORE_LOGO_PATH).toBe("/brand/lr-market-logo.svg");
});
