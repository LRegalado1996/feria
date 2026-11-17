import { expect, STORE_SETTINGS, STORE_TEXTS, test } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { StorePage } from "../../page-objects/store.page";

// FER-021. Every page of the store sits between one header and one footer;
// the footer reads the store's settings, the run's (`STORE_SETTINGS`).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Storefront shell", () => {
  test("the bar shows the store's tagline, the full logo leads home, the links lead to the catalog, and the skip link to the content", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await storePage.goto();

    await expect(storePage.getAnnouncementBar()).toHaveText(
      STORE_TEXTS.es.tagline
    );
    const header = storePage.getSiteHeader();
    const home = header.getByRole("link", { name: "LR Market, ir al inicio" });
    await expect(home).toHaveAttribute("href", "/");
    await expect(home.locator('[data-slot="store-logo"]')).toHaveAttribute(
      "data-variant",
      "full"
    );
    const nav = header.getByRole("navigation", {
      name: "Secciones de la tienda",
    });
    await expect(nav.getByRole("link", { name: "Catálogo" })).toHaveAttribute(
      "href",
      "/products"
    );

    // The first Tab of the page reaches the skip link, which moves focus to
    // the page's content.
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("store-main")).toBeFocused();
  });

  test("an address that nothing answers is a 404 inside the store's shell", async ({
    page,
  }) => {
    const storePage = new StorePage(page);

    const response = await page.goto("/no-such-page");

    expect(response?.status()).toBe(404);
    await expect(storePage.getNotFoundHeading()).toBeVisible();
    await expect(storePage.getSiteHeader()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Volver al inicio de la tienda" })
    ).toHaveAttribute("href", "/");
  });

  for (const { name, viewport } of [
    { name: "a computer", viewport: { height: 900, width: 1440 } },
    // On a phone the pill is in the menu.
    { name: "a phone", viewport: { height: 844, width: 390 } },
  ]) {
    test(`on ${name}, the language pill leads to the same page in English with its query, and back`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const storePage = new StorePage(page);
      const reachToggle = async (menuName: string) => {
        if (viewport.width < 768) {
          await clickUntilVisible(
            storePage.getMenuButton(menuName),
            storePage.getMobileMenu()
          );
        }
      };
      await page.goto("/?ref=qr");
      await storePage.waitForLoad();
      await reachToggle("Menú");

      const toggle = storePage.getLocaleToggle();
      // React reads the URL before the link carries it (src/e2e/AGENTS.md).
      await expect(toggle).toHaveAttribute("href", "/en?ref=qr");
      await expect(toggle).toHaveAccessibleName("English");
      await expect(toggle).toHaveAttribute("lang", "en");
      await expect(storePage.getLocaleToggleThumb()).toHaveAttribute(
        "data-side",
        "start"
      );
      await toggle.click();

      await expect(page).toHaveURL("/en?ref=qr");
      await expect(storePage.getFooter()).toContainText(STORE_TEXTS.en.tagline);
      await storePage.expectDocumentLanguage("en");
      await reachToggle("Menu");
      await expect(toggle).toHaveAccessibleName("Español");
      await expect(storePage.getLocaleToggleThumb()).toHaveAttribute(
        "data-side",
        "end"
      );
      await expect(toggle).toHaveAttribute("href", "/?ref=qr");
      await toggle.click();

      await expect(page).toHaveURL("/?ref=qr");
      await storePage.expectDocumentLanguage("es");
    });
  }

  test.describe("on a phone", () => {
    test.use({ viewport: { height: 812, width: 375 } });

    test("the menu opens full screen with the links, and closes with its button and with Escape", async ({
      page,
    }) => {
      const storePage = new StorePage(page);
      await storePage.goto();
      const menu = storePage.getMobileMenu();

      // The first open after the page loaded: repeated until React owns it.
      await clickUntilVisible(storePage.getMenuButton("Menú"), menu);
      // Full screen: it covers the whole window.
      expect(await menu.boundingBox()).toEqual({
        height: 812,
        width: 375,
        x: 0,
        y: 0,
      });
      await expect(menu.getByRole("link", { name: "Catálogo" })).toBeVisible();
      await expect(menu.getByRole("link", { name: "English" })).toBeVisible();
      await menu.getByRole("button", { name: "Cerrar el menú" }).click();
      await expectDialogRemoved(page, menu);

      await storePage.getMenuButton("Menú").click();
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expectDialogRemoved(page, menu);
    });
  });

  test("the footer shows only the links the store has, and the credit", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await storePage.goto();
    const footer = storePage.getFooter();

    await expect(footer).toContainText(STORE_TEXTS.es.tagline);
    await expect(
      footer.getByRole("link", { name: `Instagram de ${STORE_SETTINGS.name}` })
    ).toHaveAttribute("href", STORE_SETTINGS.instagramUrl);
    await expect(
      footer.getByRole("link", { name: "Escribinos por WhatsApp" })
    ).toHaveAttribute(
      "href",
      `https://wa.me/${STORE_SETTINGS.whatsappNumber.slice(1)}`
    );
    // The store has no TikTok in the run's settings.
    await expect(footer.getByRole("link", { name: /TikTok/u })).toHaveCount(0);
    await expect(
      footer.getByRole("link", { name: "Hecho por Lucas Regalado" })
    ).toHaveAttribute("href", "https://lucasregalado.com");
  });

  test("the cart button says how many units the browser's one cart holds", async ({
    page,
  }) => {
    const storePage = new StorePage(page);
    await storePage.goto();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, vacío"
    );

    await page.evaluate(() => {
      localStorage.setItem(
        "feria:cart",
        JSON.stringify([
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 1 },
        ])
      );
    });
    await storePage.goto();

    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 3 unidades"
    );
    await expect(storePage.getCartButton()).toHaveAttribute("href", "/cart");
  });
});
