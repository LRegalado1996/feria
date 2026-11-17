import type { Page } from "@playwright/test";

import {
  type DbFixture,
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  STORE_SETTINGS,
  test,
  uniqueTag,
} from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { StorePage } from "../../page-objects/store.page";

// FER-043. Each test seeds a group of its own in the one store every spec
// shares (FER-038) and reads only its pages.
test.use({ storageState: { cookies: [], origins: [] } });

const BINGBOT =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

/** A seed photo as a cover's computer image (`public/seed/`). */
const COVER = { height: 800, url: "/seed/ring-2.jpg", width: 1200 };

/**
 * A group, "Bijou", holding Anillos (with a cover and two articles) and Aros
 * (one article), and Burbujas in no group (one article). Every name ends in
 * the test's tag.
 */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const group = await db.seed.createCategory({
    nameEs: `Bijou ${tag}`,
    slug: `bijou-${tag}`,
  });
  const rings = await db.seed.createCategory({
    cover: COVER,
    nameEs: `Anillos ${tag}`,
    parentId: group.id,
    slug: `anillos-${tag}`,
  });
  const earrings = await db.seed.createCategory({
    nameEs: `Aros ${tag}`,
    parentId: group.id,
    slug: `aros-${tag}`,
  });
  const bubbles = await db.seed.createCategory({
    nameEs: `Burbujas ${tag}`,
    slug: `burbujas-${tag}`,
  });
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  await db.seed.createArticle({
    categoryId: rings.id,
    priceAmount: 90_000,
    publishedAt: at(1),
    title: "Anillo sello",
  });
  await db.seed.createArticle({
    categoryId: rings.id,
    priceAmount: 80_000,
    publishedAt: at(2),
    title: "Anillo flor",
  });
  await db.seed.createArticle({
    categoryId: earrings.id,
    priceAmount: 50_000,
    publishedAt: at(3),
    title: "Aro perla",
  });
  await db.seed.createArticle({
    categoryId: bubbles.id,
    priceAmount: 60_000,
    publishedAt: at(4),
    title: "Burbujero cristal",
  });

  return {
    bubbles,
    group,
    /** Anillos' page, under its group. */
    ringsPath: `/${group.slug}/${rings.slug}`,
    rings,
    tag,
  };
}

/** The titles the grid shows, in order. */
function titles(page: Page) {
  return page
    .getByTestId("store-catalog-grid")
    .filter({ visible: true })
    .getByRole("heading", { level: 2 });
}

/** The visible trail above the page, step by step. */
function trail(page: Page) {
  return page.getByRole("navigation", { name: "Ruta" }).getByRole("listitem");
}

test.describe("Catalog pages", () => {
  // A crawler that reads only the HTML, such as Bingbot or most AI
  // crawlers, sees only what the server wrote in place
  // (docs/agents/nextjs.md § Store pages).
  test("a crawler that runs no script finds a category's articles, its trail and the footer in the HTML", async ({
    baseURL,
    browser,
    db,
  }) => {
    const { ringsPath, tag } = await setup({ db });
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      userAgent: BINGBOT,
    });

    try {
      const page = await context.newPage();
      const response = await page.goto(ringsPath);

      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        `Anillos ${tag}`
      );
      await expect(titles(page)).toHaveText(["Anillo sello", "Anillo flor"]);
      await expect(trail(page)).toHaveText([
        "Inicio",
        `Bijou ${tag}`,
        `Anillos ${tag}`,
      ]);
      await expect(
        new StorePage(page).getFooter().getByRole("link", {
          name: `Instagram de ${STORE_SETTINGS.name}`,
        })
      ).toHaveAttribute("href", STORE_SETTINGS.instagramUrl);
      // The header's links are in the HTML too: no script reveals them.
      await expect(
        page
          .getByRole("navigation", { name: "Secciones de la tienda" })
          .getByRole("link", { name: "Todos los artículos" })
      ).toHaveAttribute("href", "/productos");
    } finally {
      await context.close();
    }
  });

  test("a group's page lists every article of its categories; each page has its title, canonical, hreflang and structured data", async ({
    db,
    page,
  }) => {
    const { group, ringsPath, tag } = await setup({ db });

    await page.goto(`/${group.slug}`);

    await expect(titles(page)).toHaveText([
      "Anillo sello",
      "Anillo flor",
      "Aro perla",
    ]);
    await expect(trail(page)).toHaveText(["Inicio", `Bijou ${tag}`]);
    await expect(page).toHaveTitle(`Bijou ${tag} · ${STORE_SETTINGS.name}`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      `Comprá Bijou ${tag} en ${STORE_SETTINGS.name}: Anillos ${tag} y Aros ${tag}. Mirá los precios y hacé tu pedido online.`
    );

    await page.goto(`/en${ringsPath}`);

    await expect(titles(page)).toHaveText(["Anillo sello", "Anillo flor"]);
    expect(
      new URL(
        (await page.locator('link[rel="canonical"]').getAttribute("href")) ?? ""
      ).pathname
    ).toBe(`/en${ringsPath}`);
    expect(
      new URL(
        (await page
          .locator('link[rel="alternate"][hreflang="es"]')
          .getAttribute("href")) ?? ""
      ).pathname
    ).toBe(ringsPath);
    const data = JSON.parse(
      (await page
        .locator('script[type="application/ld+json"]')
        .first()
        .textContent()) ?? "null"
    ) as { "@type": string }[];
    expect(data.map((entry) => entry["@type"])).toEqual([
      "CollectionPage",
      "BreadcrumbList",
    ]);
  });

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`at ${width} px, a category's cover shows its photo with the page's h1 over it`, async ({
      db,
      page,
    }) => {
      const { ringsPath, tag } = await setup({ db });
      await page.setViewportSize({ height, width });

      await page.goto(ringsPath);

      const cover = page.getByTestId("store-catalog-cover");
      const image = cover.getByRole("img", { name: `Anillos ${tag}` });
      await expect(image).toBeVisible();
      await expect(
        cover.getByRole("heading", { level: 1, name: `Anillos ${tag}` })
      ).toBeVisible();
      // Loaded, not just placed: the browser chose a source and drew it.
      await expect
        .poll(
          async () =>
            await image.evaluate(
              (element: HTMLImageElement) =>
                element.complete && element.naturalWidth > 0
            )
        )
        .toBe(true);
      const box = await cover.boundingBox();
      expect(box?.width).toBe(width);
    });
  }

  test("a category in no group has its own page; a group's category asked without its group is sent to its page", async ({
    db,
    page,
    request,
  }) => {
    const { bubbles, rings, ringsPath, tag } = await setup({ db });

    await page.goto(`/${bubbles.slug}`);
    await expect(titles(page)).toHaveText(["Burbujero cristal"]);
    await expect(trail(page)).toHaveText(["Inicio", `Burbujas ${tag}`]);

    const moved = await request.get(`/${rings.slug}?sort=price_asc`, {
      headers: { "User-Agent": BINGBOT },
      maxRedirects: 0,
    });
    expect(moved.status()).toBe(308);
    expect(moved.headers().location).toBe(`${ringsPath}?sort=price_asc`);

    const unknown = await request.get(`/bijou-${tag}/relojes-${tag}`, {
      headers: { "User-Agent": BINGBOT },
    });
    expect(unknown.status()).toBe(404);
  });

  test("on a phone, the menu's group unfolds to its categories, folds on Escape, and each leads to its page", async ({
    db,
    page,
  }) => {
    const { ringsPath, tag } = await setup({ db });
    await page.setViewportSize({ height: 812, width: 375 });
    const storePage = new StorePage(page);
    await page.goto("/productos");
    const menu = storePage.getMobileMenu();

    await clickUntilVisible(storePage.getMenuButton("Menú"), menu);
    const toggle = menu.getByRole("button", {
      name: `Bijou ${tag}: sus categorías`,
    });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(
      menu.getByRole("link", { name: `Anillos ${tag}` })
    ).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Escape there folds the categories back, and the menu stays open.
    await page.keyboard.press("Escape");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toBeFocused();
    await expect(menu).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await menu.getByRole("link", { name: `Anillos ${tag}` }).click();

    await expect(page).toHaveURL(ringsPath);
    await expect(titles(page)).toHaveText(["Anillo sello", "Anillo flor"]);
  });
});

test.describe("Header group dropdown", () => {
  // `/design` shows the header with LR Market's own navigation (FER-043):
  // Bijouterie holding four categories, then the bubble guns.
  test("opens from the keyboard, its links 44 px targets, and Escape closes it, handing focus back", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/design");
    const nav = page
      .getByTestId("design-shell")
      .getByRole("navigation", { name: "Secciones de la tienda" });
    const toggle = nav.getByRole("button", {
      name: "Bijouterie: sus categorías",
    });
    const chains = nav.getByRole("link", { name: "Cadenas" });

    await clickUntilVisible(toggle, chains);
    await toggle.click();
    await expect(chains).toBeHidden();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");

    await expect(chains).toBeFocused();
    for (const target of [toggle, chains]) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await page.keyboard.press("Escape");

    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(chains).toBeHidden();
    // Before the script runs the group's name is the way in.
    await expect(nav.getByRole("link", { name: "Bijouterie" })).toHaveAttribute(
      "href",
      "/bijouterie"
    );
  });
});
