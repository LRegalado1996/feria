import type { Page } from "@playwright/test";

import { type DbFixture, expect, test } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { StorePage } from "../../page-objects/store.page";

// FER-023. Each test seeds its own store and catalog.
test.use({ storageState: { cookies: [], origins: [] } });

const TEXTS = [
  { description: "Joyas.", locale: "es" as const, tagline: "Joyas" },
  { description: "Jewelry.", locale: "en" as const, tagline: "Jewelry" },
];

/**
 * A store with Collares and Pulseras, a Color filter (Dorado, Violeta) and
 * four published articles: a gold necklace, a purple necklace, a gold
 * bracelet and a sold-out purple bracelet, newest first in that order.
 */
async function setup({ db }: { db: DbFixture["db"] }) {
  const store = await db.seed.createStore({ name: "Catalog Store" }, TEXTS);
  const necklaces = await db.seed.createCategory(store.id, {
    nameEs: "Collares",
    position: 0,
    slug: "collares",
  });
  const bracelets = await db.seed.createCategory(store.id, {
    nameEs: "Pulseras",
    position: 1,
    slug: "pulseras",
  });
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  const goldNecklace = await db.seed.createArticle(
    store.id,
    necklaces.id,
    "Collar dorado",
    { priceAmount: 120_000, publishedAt: at(1) }
  );
  const purpleNecklace = await db.seed.createArticle(
    store.id,
    necklaces.id,
    "Collar violeta",
    { priceAmount: 90_000, publishedAt: at(2) }
  );
  const goldBracelet = await db.seed.createArticle(
    store.id,
    bracelets.id,
    "Pulsera dorada",
    { priceAmount: 50_000, publishedAt: at(3) }
  );
  const purpleBracelet = await db.seed.createArticle(
    store.id,
    bracelets.id,
    "Pulsera violeta",
    { isAvailable: false, priceAmount: 70_000, publishedAt: at(4) }
  );
  await db.seed.createFilter(store.id, {
    nameEs: "Color",
    slug: "color",
    values: [
      {
        articleIds: [goldNecklace.id, goldBracelet.id],
        nameEs: "Dorado",
        slug: "dorado",
        swatchColor: "#d4af37",
      },
      {
        articleIds: [purpleNecklace.id, purpleBracelet.id],
        nameEs: "Violeta",
        slug: "violeta",
      },
    ],
  });

  return { store };
}

/** The titles the grid shows, in order. */
function titles(page: Page) {
  return page.getByTestId("store-catalog-grid").getByRole("heading", {
    level: 2,
  });
}

test.describe("Catalog", () => {
  test("filters by category and color in the address, and a fresh visit to the link shows the same selection", async ({
    browser,
    db,
    page,
  }) => {
    const { store } = await setup({ db });
    await page.goto(`/${store.slug}/products`);
    await expect(titles(page)).toHaveText([
      "Collar dorado",
      "Collar violeta",
      "Pulsera dorada",
      "Pulsera violeta",
    ]);
    const sidebar = page.getByTestId("store-catalog");

    await sidebar.getByRole("link", { name: "Collares" }).first().click();
    await expect(page).toHaveURL(/category=collares/u);
    await sidebar
      .getByRole("link", { name: /Dorado/u })
      .first()
      .click();
    await expect(page).toHaveURL(/category=collares&color=dorado$/u);
    await expect(titles(page)).toHaveText(["Collar dorado"]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Collares · Dorado"
    );
    await expect(page).toHaveTitle("Collares · Dorado · Catalog Store");

    // Opened fresh, as a link pasted into a chat, in English too.
    const fresh = await browser.newPage();
    try {
      await fresh.goto(
        new URL(
          `/en/${store.slug}/products?category=collares&color=dorado`,
          page.url()
        ).href
      );
      await expect(titles(fresh)).toHaveText(["Collar dorado"]);
      await expect(fresh.getByRole("heading", { level: 1 })).toHaveText(
        "Collares · Dorado"
      );
    } finally {
      await fresh.close();
    }
  });

  test("a link with stray parameters and an unknown filter still lists, ignoring them", async ({
    db,
    page,
  }) => {
    const { store } = await setup({ db });

    await page.goto(
      `/${store.slug}/products?fbclid=IwAR_X&utm_source=wa&color=fucsia&talle=m`
    );

    await expect(titles(page)).toHaveCount(4);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Catálogo"
    );
  });

  test("search follows the typing without losing focus, and the back button restores the earlier selection", async ({
    db,
    page,
  }) => {
    const { store } = await setup({ db });
    await page.goto(`/${store.slug}/products?color=violeta`);
    await expect(titles(page)).toHaveCount(2);
    const search = page.getByRole("searchbox", { name: "Buscar artículos" });

    await search.fill("pulsera");
    await expect(page).toHaveURL(/color=violeta&q=pulsera$/u);
    await expect(titles(page)).toHaveText(["Pulsera violeta"]);
    await expect(search).toBeFocused();

    await page
      .getByTestId("store-catalog")
      .getByRole("link", { name: "Collares" })
      .first()
      .click();
    await expect(page).toHaveURL(/category=collares/u);
    await page.goBack();
    await expect(page).toHaveURL(/color=violeta&q=pulsera$/u);
    await expect(search).toHaveValue("pulsera");
    await expect(titles(page)).toHaveText(["Pulsera violeta"]);
  });

  test("sorts by price and loads the next page", async ({ db, page }) => {
    const { store } = await setup({ db });
    const extra = await db.seed.createCategory(store.id, {
      nameEs: "Varios",
      position: 2,
      slug: "varios",
    });

    // 24 a page: 25 more articles make a second page.
    for (let index = 0; index < 25; index += 1) {
      await db.seed.createArticle(store.id, extra.id, `Extra ${index}`, {
        priceAmount: 1000 + index,
      });
    }

    await page.goto(`/${store.slug}/products?sort=price_desc`);
    await expect(titles(page).first()).toHaveText("Collar dorado");
    await expect(titles(page)).toHaveCount(24);

    await page.getByRole("button", { name: "Cargar más" }).click();
    await expect(titles(page)).toHaveCount(29);
    await expect(titles(page).last()).toHaveText("Extra 0");
  });

  test("adds an available article to the cart from the grid; a sold-out one has no button", async ({
    db,
    page,
  }) => {
    const { store } = await setup({ db });
    await page.goto(`/${store.slug}/products`);
    const storePage = new StorePage(page, store.slug);
    await expect(
      page.getByRole("button", { name: "Agregar al carrito: Pulsera violeta" })
    ).toHaveCount(0);

    await clickUntilVisible(
      page.getByRole("button", { name: "Agregar al carrito: Collar dorado" }),
      page.getByText("Agregado al carrito.")
    );

    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 1 unidad"
    );
  });

  test("shares a filtered view by copying its link", async ({
    context,
    db,
    page,
  }) => {
    const { store } = await setup({ db });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/${store.slug}/products?color=dorado`);
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
