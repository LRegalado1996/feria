import { type DbFixture, expect, test } from "../../fixtures";

// FER-024: what search engines and AI assistants read. Each test seeds its
// own stores; other workers' stores are in the database too, so every
// assertion is about this test's own addresses.
test.use({ storageState: { cookies: [], origins: [] } });

const TEXTS = [
  { description: "Joyas.", locale: "es" as const, tagline: "Joyas" },
  { description: "Jewelry.", locale: "en" as const, tagline: "Jewelry" },
];

/**
 * An active store with a published ring and a draft one, and an inactive
 * store with a published article of its own.
 */
async function setup({ db }: { db: DbFixture["db"] }) {
  const shop = await db.seed.createStore({ name: "SEO Store" }, TEXTS);
  const rings = await db.seed.createCategory(shop.id, {
    nameEs: "Anillos",
    position: 0,
    slug: "anillos",
  });
  const published = await db.seed.createArticle(
    shop.id,
    rings.id,
    "Anillo sello",
    { priceAmount: 69_000 }
  );
  const draft = await db.seed.createArticle(
    shop.id,
    rings.id,
    "Anillo borrador"
  );
  const closed = await db.seed.createStore(
    { isActive: false, name: "Closed Store" },
    TEXTS
  );
  const closedRings = await db.seed.createCategory(closed.id, {
    nameEs: "Anillos",
    position: 0,
    slug: "anillos",
  });
  const hidden = await db.seed.createArticle(
    closed.id,
    closedRings.id,
    "Anillo oculto",
    { priceAmount: 50_000 }
  );

  return { closed, draft, hidden, published, shop };
}

/** The paths of every `<loc>` in a sitemap, and of every `hreflang` link. */
function sitemapPaths(xml: string) {
  const paths = (pattern: RegExp) =>
    [...xml.matchAll(pattern)].map((match) => new URL(match[1] ?? "").pathname);

  return {
    alternates: paths(/hreflang="(?:es|en)" href="([^"]+)"/gu),
    locs: paths(/<loc>([^<]+)<\/loc>/gu),
  };
}

test.describe("robots.txt", () => {
  test("welcomes crawlers, keeps the admin and the API out and points at the sitemap", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    const body = await response.text();
    // One group per blank line; each group's lines in order.
    const groups = body
      .trim()
      .split(/\n\s*\n/u)
      .map((group) => group.split("\n"));
    const rules = [
      "Allow: /",
      "Disallow: /admin$",
      "Disallow: /admin/",
      "Disallow: /en/admin$",
      "Disallow: /en/admin/",
      "Disallow: /api/",
      "Disallow: /coming-soon$",
      "Disallow: /en/coming-soon$",
    ];

    expect(response.status()).toBe(200);
    expect(groups.find((group) => group[0] === "User-Agent: *")).toEqual([
      "User-Agent: *",
      ...rules,
    ]);
    // The named crawlers read only their own group, which repeats the rules.
    const named = groups.find((group) =>
      group.includes("User-Agent: ClaudeBot")
    );
    expect(named?.filter((line) => !line.startsWith("User-Agent:"))).toEqual(
      rules
    );
    expect(body).toMatch(/^Sitemap: https?:\/\/[^/\s]+\/sitemap\.xml$/mu);
  });
});

test.describe("sitemap.xml", () => {
  test("lists the store's home, catalog and published article in both languages, never a draft or an inactive store", async ({
    db,
    request,
  }) => {
    const { closed, draft, hidden, published, shop } = await setup({ db });

    const response = await request.get("/sitemap.xml");
    const { alternates, locs } = sitemapPaths(await response.text());

    expect(response.status()).toBe(200);
    const own = (path: string) =>
      path.startsWith(`/${shop.slug}`) || path.startsWith(`/en/${shop.slug}`);
    expect(locs.filter(own)).toEqual([
      `/${shop.slug}`,
      `/en/${shop.slug}`,
      `/${shop.slug}/products`,
      `/en/${shop.slug}/products`,
      `/${shop.slug}/products/${published.slug}`,
      `/en/${shop.slug}/products/${published.slug}`,
    ]);
    expect(alternates).toContain(`/en/${shop.slug}/products/${published.slug}`);

    const everything = [...locs, ...alternates];
    expect(everything.filter((path) => path.endsWith(draft.slug))).toEqual([]);
    expect(everything.filter((path) => path.includes(closed.slug))).toEqual([]);
    expect(everything.filter((path) => path.endsWith(hidden.slug))).toEqual([]);
  });
});

test.describe("llms.txt", () => {
  for (const [language, prefix, heading] of [
    ["Spanish", "", "## Artículos"],
    ["English", "/en", "## Articles"],
  ] as const) {
    test(`describes the store in ${language} with its published article, never the draft`, async ({
      db,
      request,
    }) => {
      const { draft, published, shop } = await setup({ db });

      const response = await request.get(`${prefix}/${shop.slug}/llms.txt`);
      const body = await response.text();

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe(
        "text/markdown; charset=utf-8"
      );
      expect(body.startsWith("# SEO Store\n")).toBe(true);
      expect(body).toContain(`${heading}\n`);
      expect(body).toMatch(
        new RegExp(
          String.raw`^- \[Anillo sello\]\(https?://[^/)]+${prefix}/${shop.slug}/products/${published.slug}\): `,
          "mu"
        )
      );
      expect(body).not.toContain(draft.slug);
      expect(body).not.toContain("Anillo borrador");
    });
  }

  test("answers 404 for an inactive store", async ({ db, request }) => {
    const { closed } = await setup({ db });

    const response = await request.get(`/${closed.slug}/llms.txt`);

    expect(response.status()).toBe(404);
  });
});
