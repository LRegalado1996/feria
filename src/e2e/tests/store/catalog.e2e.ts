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

// FER-023. Each test seeds a catalog of its own in the one store every spec
// shares (FER-038) and reads only it: through its own category, its own
// filter, or a search for its tag, which every article's description holds.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Collares and Pulseras, a Color filter (Dorado, Violeta) and four published
 * articles: a gold necklace, a purple necklace, a gold bracelet and a
 * sold-out purple bracelet, newest first in that order. Every name the
 * catalog's choices show ends in the tag, so no other test's is alike.
 */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const necklaces = await db.seed.createCategory({
    nameEs: `Collares ${tag}`,
    slug: `collares-${tag}`,
  });
  const bracelets = await db.seed.createCategory({
    nameEs: `Pulseras ${tag}`,
    slug: `pulseras-${tag}`,
  });
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  const goldNecklace = await db.seed.createArticle({
    categoryId: necklaces.id,
    description: tag,
    priceAmount: 120_000,
    publishedAt: at(1),
    title: "Collar dorado",
  });
  const purpleNecklace = await db.seed.createArticle({
    categoryId: necklaces.id,
    description: tag,
    priceAmount: 90_000,
    publishedAt: at(2),
    title: "Collar violeta",
  });
  const goldBracelet = await db.seed.createArticle({
    categoryId: bracelets.id,
    description: tag,
    priceAmount: 50_000,
    publishedAt: at(3),
    title: "Pulsera dorada",
  });
  const purpleBracelet = await db.seed.createArticle({
    categoryId: bracelets.id,
    description: tag,
    isAvailable: false,
    priceAmount: 70_000,
    publishedAt: at(4),
    title: "Pulsera violeta",
  });
  await db.seed.createFilter({
    nameEs: `Color ${tag}`,
    slug: `color-${tag}`,
    values: [
      {
        articleIds: [goldNecklace.id, goldBracelet.id],
        nameEs: `Dorado ${tag}`,
        slug: "dorado",
        swatchColor: "#d4af37",
      },
      {
        articleIds: [purpleNecklace.id, purpleBracelet.id],
        nameEs: `Violeta ${tag}`,
        slug: "violeta",
      },
    ],
  });

  return {
    bracelets,
    /** The filter's address parameter. */
    color: `color-${tag}`,
    goldNecklace,
    necklaces,
    tag,
  };
}

/** The titles the grid shows, in order. */
function titles(page: Page) {
  return page.getByTestId("store-catalog-grid").getByRole("heading", {
    level: 2,
  });
}

test.describe("Catalog", () => {
  test("filters by category and color in the address, and a fresh visit to the link shows the same selection", async ({
    baseURL,
    browser,
    db,
    page,
  }) => {
    const { bracelets, color, necklaces, tag } = await setup({ db });
    await page.goto(`/products?category=${bracelets.slug}`);
    await expect(titles(page)).toHaveText([
      "Pulsera dorada",
      "Pulsera violeta",
    ]);
    const sidebar = page.getByTestId("store-catalog");

    await sidebar
      .getByRole("link", { name: `Collares ${tag}` })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`\\?category=${necklaces.slug}$`, "u")
    );
    await expect(titles(page)).toHaveText(["Collar dorado", "Collar violeta"]);
    await sidebar
      .getByRole("link", { name: new RegExp(`^Dorado ${tag}`, "u") })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`\\?category=${necklaces.slug}&${color}=dorado$`, "u")
    );
    await expect(titles(page)).toHaveText(["Collar dorado"]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `Collares ${tag} · Dorado ${tag}`
    );
    await expect(page).toHaveTitle(
      `Collares ${tag} · Dorado ${tag} · ${STORE_SETTINGS.name}`
    );

    // Opened fresh, as a link pasted into a chat, in English too.
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      timezoneId: "UTC",
    });
    try {
      const fresh = await context.newPage();
      await fresh.goto(
        `/en/products?category=${necklaces.slug}&${color}=dorado`
      );
      await expect(titles(fresh)).toHaveText(["Collar dorado"]);
      await expect(fresh.getByRole("heading", { level: 1 })).toHaveText(
        `Collares ${tag} · Dorado ${tag}`
      );
    } finally {
      await context.close();
    }
  });

  test("a link with stray parameters and an unknown filter still lists, ignoring them", async ({
    db,
    page,
  }) => {
    const { color, tag } = await setup({ db });

    await page.goto(
      `/products?q=${tag}&fbclid=IwAR_X&utm_source=wa&${color}=fucsia&talle=m`
    );

    await expect(titles(page)).toHaveText([
      "Collar dorado",
      "Collar violeta",
      "Pulsera dorada",
      "Pulsera violeta",
    ]);
    // Only the search is a selection: nothing else in the link was one.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `«${tag}»`
    );
  });

  test("search follows the typing without losing focus, and the back button restores the earlier selection", async ({
    db,
    page,
  }) => {
    const { color, necklaces, tag } = await setup({ db });
    await page.goto(`/products?${color}=violeta`);
    await expect(titles(page)).toHaveText([
      "Collar violeta",
      "Pulsera violeta",
    ]);
    const search = page.getByRole("searchbox", { name: "Buscar artículos" });

    // Filled until React owns the field: a fill before hydration is lost.
    await expect(async () => {
      await search.fill("");
      await search.fill("pulsera");
      await expect(page).toHaveURL(/q=/u, { timeout: 2000 });
    }).toPass();
    await expect(page).toHaveURL(
      new RegExp(`\\?${color}=violeta&q=pulsera$`, "u")
    );
    await expect(titles(page)).toHaveText(["Pulsera violeta"]);
    await expect(search).toBeFocused();

    await page
      .getByTestId("store-catalog")
      .getByRole("link", { name: `Collares ${tag}` })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`category=${necklaces.slug}`, "u"));
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`\\?${color}=violeta&q=pulsera$`, "u")
    );
    await expect(search).toHaveValue("pulsera");
    await expect(titles(page)).toHaveText(["Pulsera violeta"]);
  });

  test("sorts by price and loads the next page", async ({ db, page }) => {
    const { tag } = await setup({ db });
    const extra = await db.seed.createCategory({
      nameEs: `Varios ${tag}`,
      slug: `varios-${tag}`,
    });

    // 24 a page: 25 more articles make a second page.
    for (let index = 0; index < 25; index += 1) {
      await db.seed.createArticle({
        categoryId: extra.id,
        description: tag,
        priceAmount: 1000 + index,
        title: `Extra ${index}`,
      });
    }

    await page.goto(`/products?q=${tag}&sort=price_desc`);
    await expect(titles(page).first()).toHaveText("Collar dorado");
    await expect(titles(page)).toHaveCount(24);

    await page.getByRole("button", { name: "Cargar más" }).click();
    await expect(titles(page)).toHaveCount(29);
    await expect(titles(page).last()).toHaveText("Extra 0");
  });

  test("adds an available article to the cart from the grid, in the browser's one cart; a sold-out one has no button", async ({
    db,
    page,
  }) => {
    const { goldNecklace, tag } = await setup({ db });
    await page.goto(`/products?q=${tag}`);
    const storePage = new StorePage(page);
    // Enabled only once React owns it; a retried click would add twice.
    const add = page.getByRole("button", {
      name: "Agregar al carrito: Collar dorado",
    });
    await expect(add).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Agregar al carrito: Pulsera violeta" })
    ).toHaveCount(0);
    await add.click();

    await expect(page.getByText("Agregado al carrito.")).toBeVisible();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 1 unidad"
    );
    // One cart per browser, under one key whatever page filled it (FER-038):
    // the article, how many, and the price the shopper saw.
    const stored = await page.evaluate(() =>
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("feria:"))
        .map((key) => ({ key, value: window.localStorage.getItem(key) }))
    );
    expect(stored.map((entry) => entry.key)).toEqual(["feria:cart"]);
    const cart: unknown = JSON.parse(stored[0]?.value ?? "null");
    expect(cart).toEqual([
      { productId: goldNecklace.id, quantity: 1, seenPriceAmount: 120_000 },
    ]);
  });

  test("shares a filtered view by copying its link", async ({
    context,
    db,
    page,
  }) => {
    const { color } = await setup({ db });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/products?${color}=dorado`);
    // A computer browser without a share sheet copies the link.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { value: undefined });
    });

    await clickUntilVisible(
      page.getByRole("button", { name: "Compartir" }),
      page.getByText("Enlace copiado.")
    );

    expect(
      await page.evaluate(async () => await navigator.clipboard.readText())
    ).toBe(page.url());
  });
});
