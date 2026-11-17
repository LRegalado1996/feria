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
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
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

/**
 * `count` more articles of the test's, "Extra 0" to "Extra {count - 1}" in
 * the order they are added, in a category of their own, priced from 1.000
 * up and found by the test's tag.
 */
async function seedMany({
  count,
  db,
  tag,
}: {
  count: number;
  db: DbFixture["db"];
  tag: string;
}) {
  const extra = await db.seed.createCategory({
    nameEs: `Varios ${tag}`,
    slug: `varios-${tag}`,
  });

  // 24 a page: 25 more articles make a second page.
  for (let index = 0; index < count; index += 1) {
    await db.seed.createArticle({
      categoryId: extra.id,
      description: tag,
      priceAmount: 1000 + index,
      title: `Extra ${index}`,
    });
  }
}

/**
 * The titles the grid shows, in order. Hidden ones too: while the filter
 * panel is open it hides the page behind it from assistive technology, and
 * the grid is still what the address shows.
 */
function titles(page: Page) {
  // The page on screen: a catalog page left behind stays mounted, hidden
  // (docs/agents/nextjs.md § Navigation).
  return page
    .getByTestId("store-catalog-grid")
    .filter({ visible: true })
    .getByRole("heading", {
      includeHidden: true,
      level: 2,
    });
}

/**
 * The filter panel, opened from its button ("Filtrar", with how many choices
 * are on): the first press may land before React owns the button.
 */
async function openFilters(page: Page) {
  const panel = page.getByRole("dialog", { name: "Filtrar" });
  await clickUntilVisible(
    page.getByRole("button", { name: /^Filtrar/u }),
    panel
  );

  return panel;
}

test.describe("Catalog", () => {
  test("filters by category and color in the address, and a fresh visit to the link shows the same selection", async ({
    baseURL,
    browser,
    db,
    page,
  }) => {
    const { bracelets, color, necklaces, tag } = await setup({ db });
    await page.goto(`/${bracelets.slug}`);
    await expect(titles(page)).toHaveText([
      "Pulsera dorada",
      "Pulsera violeta",
    ]);
    const panel = await openFilters(page);

    await panel.getByRole("link", { name: `Collares ${tag}` }).click();
    await expect(page).toHaveURL(new RegExp(`/${necklaces.slug}$`, "u"));
    await expect(titles(page)).toHaveText(["Collar dorado", "Collar violeta"]);
    // A category is a page of its own (FER-043): its panel opens fresh, the
    // category marked in it, and stays open while a filter is chosen.
    const again = await openFilters(page);
    await expect(
      again.getByRole("link", { name: `Collares ${tag}` })
    ).toHaveAttribute("aria-current", "true");
    await again
      .getByRole("link", { name: new RegExp(`^Dorado ${tag}`, "u") })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/${necklaces.slug}\\?${color}=dorado$`, "u")
    );
    await expect(titles(page)).toHaveText(["Collar dorado"]);
    await expect(again).toBeVisible();
    await again.getByRole("button", { name: "Ver resultados" }).click();
    await expectDialogRemoved(page, again);
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
      await fresh.goto(`/en/${necklaces.slug}?${color}=dorado`);
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
      `/productos?q=${tag}&fbclid=IwAR_X&utm_source=wa&${color}=fucsia&talle=m`
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

  test("sorts from its menu of links, keeping the selection in the address", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    await page.goto(`/productos?q=${tag}`);
    await expect(titles(page)).toHaveText([
      "Collar dorado",
      "Collar violeta",
      "Pulsera dorada",
      "Pulsera violeta",
    ]);
    const menu = page.getByRole("menu");

    // The store's own order is the default: nothing chosen, nothing named.
    await clickUntilVisible(
      page.getByRole("button", { exact: true, name: "Ordenar por" }),
      menu
    );
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Destacados",
      "Precio: menor a mayor",
      "Precio: mayor a menor",
      "Más nuevos",
    ]);
    for (const item of await menu.getByRole("menuitem").all()) {
      await expect(item).not.toHaveAttribute("aria-current");
    }
    await menu.getByRole("menuitem", { name: "Precio: menor a mayor" }).click();

    await expect(page).toHaveURL(
      new RegExp(`\\?q=${tag}&sort=price_asc$`, "u")
    );
    await expect(titles(page)).toHaveText([
      "Pulsera dorada",
      "Pulsera violeta",
      "Collar violeta",
      "Collar dorado",
    ]);
    await expect(
      page.getByRole("button", { name: "Ordenar por: Precio: menor a mayor" })
    ).toBeVisible();
  });

  test("sorts by price and loads the next page from its link, in place", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    await seedMany({ count: 25, db, tag });
    // Only the link loads here: with the observer live, the scroll that
    // brings the link into view could start the next page first, and a
    // press while a page loads asks for nothing (and moves no focus).
    await page.addInitScript(() => {
      // An observer that watches nothing never reports.
      IntersectionObserver.prototype.observe = () => undefined;
    });

    await page.goto(`/productos?q=${tag}&sort=price_desc`);
    await expect(titles(page).first()).toHaveText("Collar dorado");
    await expect(titles(page)).toHaveCount(24);

    const more = page.getByRole("link", { name: "Cargar más" });
    // A real link to the next page, the sort and the search kept.
    await expect(more).toHaveAttribute(
      "href",
      new RegExp(
        `^/productos\\?q=${tag}&sort=price_desc&cursor=\\d+\\.\\d+$`,
        "u"
      )
    );
    // A press before React owns the page would follow the link instead.
    await new StorePage(page).getLiveSearchButton();
    await more.click();
    await expect(titles(page)).toHaveCount(29);
    await expect(titles(page).last()).toHaveText("Extra 0");
    // Loaded in place: the address is the list's, not the next page's.
    await expect(page).toHaveURL(
      new RegExp(`/productos\\?q=${tag}&sort=price_desc$`, "u")
    );
    // The page it asked for takes focus: its first card, the 25th.
    await expect(
      page.getByTestId("store-catalog-grid").getByRole("link").nth(24)
    ).toBeFocused();
  });

  test("the default order is the store's own: nothing chosen, articles in the order they were added", async ({
    db,
    page,
  }) => {
    const tag = uniqueTag();
    const shelf = await db.seed.createCategory({
      nameEs: `Estante ${tag}`,
      slug: `estante-${tag}`,
    });
    const at = (minutesAgo: number) =>
      new Date(Date.now() - minutesAgo * 60_000);
    // Added in this order; the newest first and both prices read otherwise.
    for (const [title, minutesAgo, priceAmount] of [
      ["Primero", 30, 50_000],
      ["Segundo", 10, 90_000],
      ["Tercero", 20, 10_000],
    ] as const) {
      await db.seed.createArticle({
        categoryId: shelf.id,
        priceAmount,
        publishedAt: at(minutesAgo),
        title,
      });
    }

    await page.goto(`/${shelf.slug}`);

    await expect(titles(page)).toHaveText(["Primero", "Segundo", "Tercero"]);
    const menu = page.getByRole("menu");
    await clickUntilVisible(
      page.getByRole("button", { exact: true, name: "Ordenar por" }),
      menu
    );
    await menu.getByRole("menuitem", { name: "Más nuevos" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/${shelf.slug}\\?sort=newest$`, "u")
    );
    await expect(titles(page)).toHaveText(["Segundo", "Tercero", "Primero"]);
    const named = page.getByRole("button", {
      name: "Ordenar por: Más nuevos",
    });
    await clickUntilVisible(named, menu);
    await expect(
      menu.getByRole("menuitem", { name: "Más nuevos" })
    ).toHaveAttribute("aria-current", "true");

    // Back to the store's own order: its link is the bare address.
    await menu.getByRole("menuitem", { name: "Destacados" }).click();
    await expect(page).toHaveURL(new RegExp(`/${shelf.slug}$`, "u"));
    await expect(titles(page)).toHaveText(["Primero", "Segundo", "Tercero"]);
  });

  test("the filter button says how many filter values are chosen, and no pills list them", async ({
    db,
    page,
  }) => {
    const { color, necklaces, tag } = await setup({ db });

    await page.goto(`/${necklaces.slug}?${color}=dorado,violeta`);

    const trigger = page.getByRole("button", {
      name: "Filtrar, 2 filtros elegidos",
    });
    await expect(trigger).toBeVisible();
    // What the eye reads: the word and the count.
    await expect(trigger.getByText("Filtrar (2)")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Quitar/u })).toHaveCount(0);
    // Every chosen value was a pill, a link that removed it: none is left.
    await expect(
      page.getByRole("link", { name: new RegExp(`Dorado ${tag}`, "u") })
    ).toHaveCount(0);
    await expect(titles(page)).toHaveText(["Collar dorado", "Collar violeta"]);
  });

  test("loads the next pages by itself near the end of the list, says so, and leaves the footer in reach once it ends", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    // 4 + 45 = 49 articles: three pages of 24.
    await seedMany({ count: 45, db, tag });
    const storePage = new StorePage(page);

    await page.goto(`/productos?q=${tag}`);
    await expect(titles(page)).toHaveCount(24);
    const status = page.getByTestId("store-catalog-status");
    await expect(status).toHaveText("");

    // Toward the end of the grid, no press: the next page comes by itself.
    await titles(page).nth(23).scrollIntoViewIfNeeded();
    await expect(titles(page)).toHaveCount(48);
    await expect(status).toHaveText("Se cargaron 24 artículos más; ya ves 48.");

    await titles(page).nth(47).scrollIntoViewIfNeeded();
    await expect(titles(page)).toHaveCount(49);
    await expect(status).toHaveText(
      "Se cargó 1 artículo más; ya ves 49. Ya están todos."
    );
    await expect(page.getByRole("link", { name: "Cargar más" })).toHaveCount(0);

    // Nothing pulls any more: the footer stays where the list ends.
    const footer = storePage.getFooter();
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toBeInViewport();
    await expect(titles(page)).toHaveCount(49);
  });

  test("without the script, Cargar más is a link that opens the next page, kept out of the index", async ({
    baseURL,
    browser,
    db,
  }) => {
    const { tag } = await setup({ db });
    await seedMany({ count: 25, db, tag });
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
      timezoneId: "UTC",
    });

    try {
      const page = await context.newPage();
      // A category's page, with no search: a search is kept out of the
      // index by itself, so only a page without one shows the later
      // page's own rule.
      await page.goto(`/varios-${tag}`);
      await expect(titles(page)).toHaveCount(24);
      await expect(titles(page).first()).toHaveText("Extra 0");
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

      await page.getByRole("link", { name: "Cargar más" }).click();

      // The page after the first: the last one, in the store's order.
      await expect(page).toHaveURL(
        new RegExp(`/varios-${tag}\\?cursor=\\d+\\.\\d+$`, "u")
      );
      await expect(titles(page)).toHaveText(["Extra 24"]);
      await expect(page.getByRole("link", { name: "Cargar más" })).toHaveCount(
        0
      );
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, follow"
      );
    } finally {
      await context.close();
    }
  });

  test("a card is one link to its article, with nothing to add; the article's page adds to the browser's one cart", async ({
    db,
    page,
  }) => {
    const { goldNecklace, tag } = await setup({ db });
    await page.goto(`/productos?q=${tag}`);
    const storePage = new StorePage(page);
    const grid = page.getByTestId("store-catalog-grid");
    await expect(titles(page).first()).toBeVisible();
    // No card carries a button, an available one or a sold-out one.
    await expect(grid.getByRole("button")).toHaveCount(0);

    await grid.getByRole("link", { name: /Collar dorado/u }).click();
    await expect(page).toHaveURL(`/productos/${goldNecklace.slug}`);
    // Enabled only once React owns it; a retried click would add twice.
    const add = page.getByRole("button", {
      exact: true,
      name: "Agregar al carrito",
    });
    await expect(add).toBeEnabled();
    await add.click();

    // Adding opens the cart's side panel on the article (FER-045).
    await expect(
      storePage.getCartPanel().getByTestId("store-cart-panel-status")
    ).toHaveText("Agregaste Collar dorado al carrito.");
    await storePage.closeCartPanel();
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

  test("a catalog page shows neither its description nor a share button (FER-044)", async ({
    db,
    page,
  }) => {
    const { necklaces, tag } = await setup({ db });

    await page.goto(`/${necklaces.slug}`);
    await expect(titles(page)).toHaveText(["Collar dorado", "Collar violeta"]);

    const description = `Comprá Collares ${tag} en ${STORE_SETTINGS.name}. Mirá los precios y hacé tu pedido online.`;
    // Still the page's description for search engines and share cards.
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      description
    );
    await expect(page.getByText(description)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Compartir" })).toHaveCount(
      0
    );
  });
});
