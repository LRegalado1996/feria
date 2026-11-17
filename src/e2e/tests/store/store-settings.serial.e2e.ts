import type { Page } from "@playwright/test";

import {
  expect,
  STORE_SETTINGS,
  STORE_TEXTS,
  test,
  uniqueTag,
} from "../../fixtures";
import { StorePage } from "../../page-objects/store.page";

// The store's settings are one row every spec reads (FER-038), so a spec that
// changes them, or tries to, runs alone in the serial project, before the
// parallel one. `storeEdit` writes the run's settings (`STORE_SETTINGS`) back
// when each test ends.
test.use({ storageState: { cookies: [], origins: [] } });

/** The home's intro, where the tagline and the name are. */
function introOf(page: Page) {
  return page.getByTestId("store-intro-header").filter({ visible: true });
}

test.describe("Editing the store", () => {
  test("an edit through the API reaches the cached storefront at once: name, texts and links", async ({
    page,
    storeEdit,
  }) => {
    const storePage = new StorePage(page);
    // Visited first, so the store as it was is what the cache holds.
    await storePage.goto();
    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);

    await storeEdit.update({
      instagramUrl: null,
      name: "Puesto Editado",
      tiktokUrl: "https://tiktok.com/@puesto-editado",
      translations: [{ ...STORE_TEXTS.es, tagline: "Texto nuevo" }],
      whatsappNumber: null,
    });
    await storePage.goto();

    await expect(storePage.getHeading(1)).toHaveText("Puesto Editado");
    await expect(page).toHaveTitle("Puesto Editado");
    await expect(introOf(page).getByText("Texto nuevo")).toBeVisible();
    const footer = storePage.getFooter();
    // The footer tells Pepe's story, never the tagline (FER-044); the
    // store's name signs its copyright.
    await expect(footer).toContainText("© Puesto Editado");
    await expect(footer).not.toContainText("Texto nuevo");
    await expect(
      footer.getByRole("link", { name: "TikTok de Puesto Editado" })
    ).toHaveAttribute("href", "https://tiktok.com/@puesto-editado");
    await expect(footer.getByRole("link", { name: /Instagram/u })).toHaveCount(
      0
    );
    await expect(footer.getByRole("link", { name: /WhatsApp/u })).toHaveCount(
      0
    );

    // A second edit, of a page cached as the first left it: no texts at all.
    await storeEdit.update({ translations: [] });
    await storePage.goto();

    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(
      footer.getByRole("link", { name: `Instagram de ${STORE_SETTINGS.name}` })
    ).toHaveAttribute("href", STORE_SETTINGS.instagramUrl);
    await expect(storePage.getDescription()).toHaveCount(0);
    await expect(footer).not.toContainText("Texto nuevo");
  });

  test("a change of currency reaches the cached article page and the catalog at once", async ({
    db,
    page,
    storeEdit,
  }) => {
    const tag = uniqueTag();
    const rings = await db.seed.createCategory({
      nameEs: `Anillos ${tag}`,
      slug: `anillos-${tag}`,
    });
    const ring = await db.seed.createArticle({
      categoryId: rings.id,
      priceAmount: 120_000,
      title: "Anillo de plata",
    });
    const article = page.getByTestId("store-article");
    // Visited in pesos first: that is what the article's static page holds.
    await page.goto(`/productos/${ring.slug}`);
    await expect(article.getByText("$ 1.200", { exact: true })).toBeVisible();

    await storeEdit.update({ currencyCode: "USD" });
    await page.goto(`/productos/${ring.slug}`);

    await expect(article.getByText("US$ 1.200", { exact: true })).toBeVisible();
    await expect(article.getByText("$ 1.200", { exact: true })).toHaveCount(0);
    await page.goto(`/${rings.slug}`);
    await expect(
      page
        .getByTestId("store-catalog-grid")
        .getByText("US$ 1.200", { exact: true })
    ).toBeVisible();
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { height: 812, width: 375 } });

    test("the home fits a phone without scrolling sideways, a long name included", async ({
      page,
      storeEdit,
    }) => {
      const name = "Bisutería-Internacional-Montevideo y compañía";
      await storeEdit.update({ name });
      const storePage = new StorePage(page);

      await storePage.goto();

      await expect(storePage.getHeading(1)).toHaveText(name);
      await storePage.expectNoHorizontalScroll();
    });
  });

  test("the API refuses settings it cannot keep, and the store keeps its own", async ({
    page,
    storeEdit,
  }) => {
    const refused = [
      ["a blank name", { name: "   " }],
      [
        "an Instagram link that is not https",
        { instagramUrl: "http://instagram.com/x" },
      ],
      [
        "an Instagram link to another site",
        { instagramUrl: "https://evil.example/x" },
      ],
      ["a WhatsApp number in local form", { whatsappNumber: "099 123 456" }],
      ["a currency the store cannot sell in", { currencyCode: "EUR" }],
      [
        "a language twice",
        {
          translations: [
            STORE_TEXTS.es,
            { ...STORE_TEXTS.es, tagline: "Otra" },
          ],
        },
      ],
    ] as const;

    for (const [what, change] of refused) {
      await test.step(what, async () => {
        expect(await storeEdit.send({ ...STORE_SETTINGS, ...change })).toBe(
          400
        );
      });
    }

    const storePage = new StorePage(page);
    await storePage.goto();

    await expect(storePage.getHeading(1)).toHaveText(STORE_SETTINGS.name);
    await expect(introOf(page).getByText(STORE_TEXTS.es.tagline)).toBeVisible();
  });

  test("a signed-out caller cannot edit the store", async ({
    db,
    page,
    // Asked for its teardown alone: were the refusal to fail, the edit it
    // let through is undone before anything else reads the store.
    storeEdit: _restoresTheSettings,
  }) => {
    // The page's own request context, signed out like the page (above).
    const response = await page.request.post("/api/orpc/store/update", {
      data: { json: { ...STORE_SETTINGS, name: "Taken Over" } },
    });

    expect(response.status()).toBe(401);
    await expect(
      db.drizzle.query.store.findFirst({ columns: { name: true } })
    ).resolves.toEqual({ name: STORE_SETTINGS.name });
  });
});
