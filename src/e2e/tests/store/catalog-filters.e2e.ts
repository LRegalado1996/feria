import type { Locator, Page } from "@playwright/test";

import { type DbFixture, expect, test, uniqueTag } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";

// FER-039. The catalog's filter panel: a drawer from the left on a computer,
// a sheet from the bottom on a phone, worked by keyboard as well as by
// touch. Each test seeds a catalog of its own in the store every spec shares
// (FER-038) and reads only it, through a search for its tag.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Two categories of the test's own and three published articles, every
 * description holding the tag the page searches for.
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
  await db.seed.createArticle({
    categoryId: necklaces.id,
    description: tag,
    priceAmount: 120_000,
    publishedAt: at(1),
    title: "Collar dorado",
  });
  await db.seed.createArticle({
    categoryId: bracelets.id,
    description: tag,
    priceAmount: 50_000,
    publishedAt: at(2),
    title: "Pulsera dorada",
  });
  await db.seed.createArticle({
    categoryId: bracelets.id,
    description: tag,
    priceAmount: 70_000,
    publishedAt: at(3),
    title: "Pulsera plateada",
  });

  return { bracelets, tag };
}

/** The titles the grid shows, the ones the open panel hides included. */
function titles(page: Page): Locator {
  return page.getByTestId("store-catalog-grid").getByRole("heading", {
    includeHidden: true,
    level: 2,
  });
}

/**
 * Waits until React owns the page: an add-to-cart button is disabled until
 * it does, and the filter panel's button hydrates with it, so a key pressed
 * on that button after this opens the panel.
 */
async function waitForHydration(page: Page, title: string): Promise<void> {
  await expect(
    page.getByRole("button", { name: `Agregar al carrito: ${title}` })
  ).toBeEnabled();
}

test.describe("Catalog filter panel", () => {
  test("works by keyboard: opens from Filtrar, applies a category and stays open, then Escape hands focus back", async ({
    db,
    page,
  }) => {
    const { bracelets, tag } = await setup({ db });
    await page.goto(`/products?category=${bracelets.slug}&q=${tag}`);
    await expect(titles(page)).toHaveText([
      "Pulsera dorada",
      "Pulsera plateada",
    ]);
    await waitForHydration(page, "Pulsera dorada");
    const trigger = page.getByRole("button", { name: /^Filtrar/u });
    const panel = page.getByRole("dialog", { name: "Filtrar" });

    // The control before it in the page is the share button: Tab from there
    // reaches the panel's button, which counts the category chosen.
    await page.getByRole("button", { name: "Compartir" }).focus();
    await page.keyboard.press("Tab");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAccessibleName("Filtrar (1)");

    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    // Focus moved inside, to its first control, and Tab goes on to the
    // categories, "Todas" first.
    await expect(
      panel.getByRole("button", { name: "Cerrar los filtros" })
    ).toBeFocused();
    await page.keyboard.press("Tab");
    const all = panel.getByRole("link", { name: "Todas" });
    await expect(all).toBeFocused();
    await expect(
      panel.getByRole("link", { name: `Pulseras ${tag}` })
    ).toHaveAttribute("aria-current", "true");

    await page.keyboard.press("Enter");

    // The address and the grid follow; the panel stays open on the choice.
    await expect(page).toHaveURL(new RegExp(`/products\\?q=${tag}$`, "u"));
    await expect(titles(page)).toHaveText([
      "Collar dorado",
      "Pulsera dorada",
      "Pulsera plateada",
    ]);
    await expect(panel).toBeVisible();
    await expect(all).toHaveAttribute("aria-current", "true");
    await expect(
      panel.getByRole("link", { name: `Pulseras ${tag}` })
    ).not.toHaveAttribute("aria-current");

    await page.keyboard.press("Escape");
    await expectDialogRemoved(page, panel);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAccessibleName("Filtrar");
  });

  test("on a computer it is a drawer along the left edge, full height", async ({
    db,
    page,
  }) => {
    const { tag } = await setup({ db });
    await page.goto(`/products?q=${tag}`);
    const panel = page.getByRole("dialog", { name: "Filtrar" });

    await clickUntilVisible(
      page.getByRole("button", { name: /^Filtrar/u }),
      panel
    );

    const viewport = page.viewportSize();
    // Polled: the drawer slides in before it rests against the edge.
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();

        return box && { height: box.height, width: box.width, x: box.x };
      })
      .toEqual({ height: viewport?.height, width: 400, x: 0 });

    await panel.getByRole("button", { name: "Ver resultados" }).click();
    await expectDialogRemoved(page, panel);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { height: 812, width: 375 } });

    test("it is a sheet across the bottom, closed with its close button", async ({
      db,
      page,
    }) => {
      const { tag } = await setup({ db });
      await page.goto(`/products?q=${tag}`);
      const panel = page.getByRole("dialog", { name: "Filtrar" });

      await clickUntilVisible(
        page.getByRole("button", { name: /^Filtrar/u }),
        panel
      );

      // Polled: the sheet slides up before it rests on the bottom edge.
      await expect
        .poll(async () => {
          const box = await panel.boundingBox();

          return (
            box && {
              bottom: Math.round(box.y + box.height),
              width: box.width,
              x: box.x,
            }
          );
        })
        .toEqual({ bottom: 812, width: 375, x: 0 });
      const box = await panel.boundingBox();
      // Shorter than the screen: the catalog shows above it.
      expect(box?.y).toBeGreaterThan(0);
      await expect(
        panel.getByRole("link", { name: `Collares ${tag}` })
      ).toBeVisible();

      await panel.getByRole("button", { name: "Cerrar los filtros" }).click();
      await expectDialogRemoved(page, panel);
    });
  });
});
