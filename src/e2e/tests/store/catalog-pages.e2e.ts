import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { category } from "../../../server/db/schema";
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
          .getByRole("link", { name: "Catálogo" })
      ).toHaveAttribute("href", "/productos");
      // The later pages are a real link away, for a crawler that runs no
      // script (FER-044); this list has none.
      await expect(page.getByRole("link", { name: "Cargar más" })).toHaveCount(
        0
      );
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

  for (const [width, height, reserve] of [
    // The window less 20rem from md up, 17.5rem on a phone (design.md).
    [1440, 900, 320],
    [390, 844, 280],
  ] as const) {
    test(`at ${width} px, a category opens on its cover, edge to edge under the header and nearly the window's height, the trail with its house under it and the first row in sight`, async ({
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
      const header = await new StorePage(page).getSiteHeader().boundingBox();
      expect(box?.width).toBe(width);
      expect(box?.x).toBe(0);
      // Attached to the header: no gap between them.
      expect(box?.y).toBe((header?.y ?? 0) + (header?.height ?? 0));
      expect(box?.height).toBe(height - reserve);

      // The trail under the cover, starting at a house named Inicio.
      const trailNav = page.getByRole("navigation", { name: "Ruta" });
      const trailBox = await trailNav.boundingBox();
      expect(trailBox?.y).toBeGreaterThanOrEqual(
        (box?.y ?? 0) + (box?.height ?? 0)
      );
      const home = trailNav.getByRole("link", { name: "Inicio" });
      await expect(home).toHaveAttribute("href", "/");
      await expect(
        home.getByTestId("store-breadcrumb-home-icon")
      ).toBeVisible();
      const homeBox = await home.boundingBox();
      expect(homeBox?.width).toBe(44);
      expect(homeBox?.height).toBe(44);

      // The first row of articles still shows at the window's bottom. This
      // test's names carry a long tag, which on a phone wraps the trail to
      // a second line; a trail of one line, as the store's own names give,
      // leaves the row higher by that much.
      const firstCard = await page
        .getByTestId("store-catalog-grid")
        .getByRole("article")
        .first()
        .boundingBox();
      const extraTrailLines = (trailBox?.height ?? 0) - 56;
      expect((firstCard?.y ?? height) - extraTrailLines).toBeLessThan(
        height - 40
      );
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

test.describe("Header", () => {
  // `/design` shows the header with LR Market's own navigation in Lucas's
  // order (FER-044): the bubble guns, then Bijouterie holding four.
  test("on a computer, the group is one control, its chevron tight against its name: it opens from the keyboard, its links 44 px targets, and Escape closes it, handing focus back", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/design");
    const nav = page
      .getByTestId("design-shell")
      .getByRole("navigation", { name: "Secciones de la tienda" });
    const toggle = nav.getByRole("button", { exact: true, name: "Bijouterie" });
    const all = nav.getByRole("link", { name: "Ver todo" });
    const chains = nav.getByRole("link", { name: "Cadenas" });

    // Measured at rest, before it turns: the chevron sits inside the
    // control, small, a few pixels after the word.
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const chevron = await toggle
      .getByTestId("store-nav-group-chevron")
      .boundingBox();
    const word = await toggle.getByText("Bijouterie").boundingBox();
    const gap = (chevron?.x ?? 0) - ((word?.x ?? 0) + (word?.width ?? 0));
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(8);
    expect(chevron?.width).toBeLessThanOrEqual(12);

    await clickUntilVisible(toggle, chains);
    await toggle.click();
    await expect(chains).toBeHidden();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    // The group's own page first, then its categories.
    await expect(all).toBeFocused();
    await expect(all).toHaveAttribute("href", "/bijouterie");
    await page.keyboard.press("Tab");
    await expect(chains).toBeFocused();
    for (const target of [toggle, all, chains]) {
      const box = await target.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    await page.keyboard.press("Escape");

    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(chains).toBeHidden();
  });

  test("before the script runs, the group's one control is a link to its page", async ({
    baseURL,
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      viewport: { height: 900, width: 1440 },
    });

    try {
      const page = await context.newPage();
      await page.goto("/design");
      const nav = page
        .getByTestId("design-shell")
        .getByRole("navigation", { name: "Secciones de la tienda" });

      // In Lucas's order, and the group a way in, not a button.
      await expect(nav.getByRole("link")).toHaveText([
        "Catálogo",
        "Burbujeros",
        "Bijouterie",
      ]);
      await expect(
        nav.getByRole("link", { name: "Bijouterie" })
      ).toHaveAttribute("href", "/bijouterie");
      await expect(nav.getByRole("button")).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("lists the groups and the categories in no group in their positions' order, in the menu and in the footer, never a group's categories in the footer", async ({
    db,
    page,
  }) => {
    const { bubbles, group, tag } = await setup({ db });
    await page.setViewportSize({ height: 812, width: 375 });
    const storePage = new StorePage(page);
    const ours = (names: string[]) =>
      names.filter((name) => name.endsWith(tag));
    const menuEntries = async () => {
      await page.goto("/productos");
      const menu = storePage.getMobileMenu();
      await clickUntilVisible(storePage.getMenuButton("Menú"), menu);
      const names = ours(await menu.getByRole("link").allTextContents());
      await page.keyboard.press("Escape");

      return names;
    };
    const footerEntries = async () =>
      ours(
        await storePage
          .getFooter()
          .getByRole("navigation", { name: "Tienda" })
          .getByRole("link")
          .allTextContents()
      );

    // The group was added first, so it comes first.
    expect(await menuEntries()).toEqual([`Bijou ${tag}`, `Burbujas ${tag}`]);
    expect(await footerEntries()).toEqual([`Bijou ${tag}`, `Burbujas ${tag}`]);

    // The admin's order is the categories' positions: swapped, the store
    // reads the other way round, nothing in the code deciding it.
    const [groupRow] = await db.drizzle
      .select({ position: category.position })
      .from(category)
      .where(eq(category.id, group.id));
    const [bubblesRow] = await db.drizzle
      .select({ position: category.position })
      .from(category)
      .where(eq(category.id, bubbles.id));
    await db.drizzle
      .update(category)
      .set({ position: bubblesRow?.position ?? 0 })
      .where(eq(category.id, group.id));
    await db.drizzle
      .update(category)
      .set({ position: groupRow?.position ?? 0 })
      .where(eq(category.id, bubbles.id));

    expect(await menuEntries()).toEqual([`Burbujas ${tag}`, `Bijou ${tag}`]);
    expect(await footerEntries()).toEqual([`Burbujas ${tag}`, `Bijou ${tag}`]);
  });
});
