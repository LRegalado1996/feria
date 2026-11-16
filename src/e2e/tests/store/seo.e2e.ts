import {
  type DbFixture,
  expect,
  STORE_SETTINGS,
  STORE_TEXTS,
  test,
  uniqueTag,
} from "../../fixtures";

// FER-024: what search engines and AI assistants read. Each test seeds its
// own articles; other tests' articles are in the one store too (FER-038), so
// every assertion about an article is about this test's own addresses.
test.use({ storageState: { cookies: [], origins: [] } });

/** A published ring and a draft one, in a category of the test's own. */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const rings = await db.seed.createCategory({
    nameEs: `Anillos ${tag}`,
    slug: `anillos-${tag}`,
  });
  const published = await db.seed.createArticle({
    categoryId: rings.id,
    priceAmount: 69_000,
    title: "Anillo sello",
  });
  const draft = await db.seed.createArticle({
    categoryId: rings.id,
    title: `Anillo borrador ${tag}`,
  });

  return { draft, published, tag };
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
      "Disallow: /admin?",
      "Disallow: /admin/",
      "Disallow: /en/admin$",
      "Disallow: /en/admin?",
      "Disallow: /en/admin/",
      "Disallow: /api/",
      "Disallow: /coming-soon$",
      "Disallow: /coming-soon?",
      "Disallow: /en/coming-soon$",
      "Disallow: /en/coming-soon?",
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
  test("lists the store's home, catalog and published article in both languages, never a draft", async ({
    db,
    request,
  }) => {
    const { draft, published } = await setup({ db });

    const response = await request.get("/sitemap.xml");
    const { alternates, locs } = sitemapPaths(await response.text());

    expect(response.status()).toBe(200);
    // The store's own pages first, then its articles, this test's among them.
    const pages = ["/", "/en", "/products", "/en/products"];
    const article = [
      `/products/${published.slug}`,
      `/en/products/${published.slug}`,
    ];
    expect(locs.slice(0, pages.length)).toEqual(pages);
    expect(locs.filter((path) => article.includes(path))).toEqual(article);
    expect(alternates).toContain(`/en/products/${published.slug}`);

    const everything = [...locs, ...alternates];
    expect(everything.filter((path) => path.endsWith(draft.slug))).toEqual([]);
  });
});

test.describe("llms.txt", () => {
  for (const [locale, language, prefix, heading] of [
    ["es", "Spanish", "", "## Artículos"],
    ["en", "English", "/en", "## Articles"],
  ] as const) {
    test(`describes the store in ${language} with its published article, never the draft`, async ({
      db,
      request,
    }) => {
      const { draft, published, tag } = await setup({ db });
      const texts = STORE_TEXTS[locale];

      const response = await request.get(`${prefix}/llms.txt`);
      const body = await response.text();

      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toBe(
        "text/markdown; charset=utf-8"
      );
      expect(
        body.startsWith(
          `# ${STORE_SETTINGS.name}\n\n> ${texts.tagline}\n\n${texts.description}\n`
        )
      ).toBe(true);
      expect(body).toContain(`${heading}\n`);
      expect(body).toMatch(
        new RegExp(
          String.raw`^- \[Anillo sello\]\(https?://[^/)]+${prefix}/products/${published.slug}\): `,
          "mu"
        )
      );
      expect(body).not.toContain(draft.slug);
      expect(body).not.toContain(`Anillo borrador ${tag}`);
    });
  }
});
