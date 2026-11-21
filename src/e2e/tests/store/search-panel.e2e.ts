import type { Locator, Page } from "@playwright/test";

import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { StorePage } from "../../page-objects/store.page";

// FER-039. The header's search: its icon opens a dark panel under the header
// with one field; a search opens the catalog with `?q=`. Each test searches
// for a tag of its own, which only its own article carries, in the store
// every spec shares (FER-038).
test.use({ storageState: { cookies: [], origins: [] } });

/** One published article, in a category of its own, whose description holds the test's tag. */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const category = await db.seed.createCategory({
    nameEs: `Pulseras ${tag}`,
    slug: `pulseras-${tag}`,
  });
  await db.seed.createArticle({
    categoryId: category.id,
    description: tag,
    priceAmount: 50_000,
    title: "Pulsera hallada",
  });

  return { tag };
}

/** The titles the catalog's grid shows. */
function titles(page: Page): Locator {
  // The page on screen: a catalog page left behind stays mounted, hidden
  // (docs/agents/nextjs.md § Navigation).
  return page
    .getByTestId("store-catalog-grid")
    .filter({ visible: true })
    .getByRole("heading", {
      level: 2,
    });
}

/**
 * Opens the panel from the keyboard: Enter on the search icon, once React
 * owns it (before then Enter opens the plain panel instead). It is pressed
 * again only while the panel has not opened.
 */
async function openWithKeyboard(storePage: StorePage): Promise<void> {
  const button = await storePage.getLiveSearchButton();
  const panel = storePage.getSearchPanel();

  await expect(async () => {
    if (!(await panel.isVisible())) {
      await button.focus();
      await storePage.page.keyboard.press("Enter");
    }

    await expect(panel).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
}

test.describe("Search panel", () => {
  test("opens from the header's icon, searches the catalog, and the back button returns to the page it left", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    const storePage = new StorePage(page);
    await storePage.goto();
    const panel = storePage.getSearchPanel();

    await clickUntilVisible(await storePage.getLiveSearchButton(), panel);
    const field = panel.getByRole("searchbox", { name: "Buscar artículos" });
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("placeholder", "Buscá lo que quieras");
    await expect(panel.getByTestId("store-search-form")).toHaveAttribute(
      "action",
      "/productos"
    );
    await field.fill(tag);
    await panel.getByRole("button", { name: "Buscar", exact: true }).click();

    await expect(page).toHaveURL(`/productos?q=${tag}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `«${tag}»`
    );
    await expect(titles(page)).toHaveText(["Pulsera hallada"]);
    await expectDialogRemoved(page, panel);

    await page.goBack();
    await expect(page).toHaveURL("/");
    await storePage.waitForLoad();
  });

  test("works by keyboard: Enter opens it on its field, Tab stays inside, Enter searches", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    const storePage = new StorePage(page);
    await storePage.goto();
    const panel = storePage.getSearchPanel();

    await openWithKeyboard(storePage);

    const field = panel.getByRole("searchbox", { name: "Buscar artículos" });
    await expect(field).toBeFocused();
    // The panel keeps the keyboard: the arrow, the close button, the field.
    await page.keyboard.press("Tab");
    await expect(
      panel.getByRole("button", { name: "Buscar", exact: true })
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      panel.getByRole("button", { name: "Cerrar la búsqueda" })
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(field).toBeFocused();

    await page.keyboard.type(tag);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(`/productos?q=${tag}`);
    await expect(titles(page)).toHaveText(["Pulsera hallada"]);
  });

  test("Escape closes it and hands focus back to the search icon", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await storePage.goto();
    const panel = storePage.getSearchPanel();

    await openWithKeyboard(storePage);
    await page.keyboard.press("Escape");

    await expectDialogRemoved(page, panel);
    await expect(storePage.getSearchButton()).toBeFocused();
    await expect(page).toHaveURL("/");
  });

  test.describe("before the script runs", () => {
    // No script at all: what a visitor has until React owns the page.
    test.use({ javaScriptEnabled: false });

    test("the icon opens the browser's own panel, whose plain form searches the catalog", async ({
      db,
      page,
    }) => {
      const { tag } = await setup({ db });
      await page.goto("/");
      const plain = page.getByTestId("store-search-plain");
      await expect(plain).toBeHidden();

      await page.getByTestId("store-search-button").click();

      await expect(plain).toBeVisible();
      await plain.getByRole("button", { name: "Cerrar la búsqueda" }).click();
      await expect(plain).toBeHidden();
      await page.getByTestId("store-search-button").click();
      await plain
        .getByRole("searchbox", { name: "Buscar artículos" })
        .fill(tag);
      await plain.getByRole("button", { name: "Buscar", exact: true }).click();

      await expect(page).toHaveURL(`/productos?q=${tag}`);
    });
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { height: 812, width: 375 } });

    test("the panel spans the screen right under the header, and its close button closes it", async ({
      page,
    }) => {
      const storePage = new StorePage(page);
      await storePage.goto();
      const panel = storePage.getSearchPanel();

      await clickUntilVisible(await storePage.getLiveSearchButton(), panel);

      const header = await storePage.getSiteHeader().boundingBox();
      const box = await panel.boundingBox();
      expect(box?.x).toBe(0);
      expect(box?.width).toBe(375);
      expect(box?.y).toBe((header?.y ?? 0) + (header?.height ?? 0));
      await panel.getByRole("button", { name: "Cerrar la búsqueda" }).click();
      await expectDialogRemoved(page, panel);
    });
  });
});
