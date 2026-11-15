import { expect, test } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { StorePage } from "../../page-objects/store.page";

// FER-021. Every page of a store sits between one header and one footer.
test.use({ storageState: { cookies: [], origins: [] } });

const TEXTS = [
  {
    description: "Anillos y cadenas hechos a mano.",
    locale: "es" as const,
    tagline: "Joyas en la feria",
  },
  {
    description: "Handmade rings and chains.",
    locale: "en" as const,
    tagline: "Jewelry at the fair",
  },
];

test.describe("Storefront shell", () => {
  test("the header leads home and to the catalog, and the skip link to the content", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore({ name: "Shell Store" }, TEXTS);
    const storePage = new StorePage(page, store.slug);
    await storePage.goto();

    const header = storePage.getSiteHeader();
    const nav = header.getByRole("navigation", {
      name: "Secciones de la tienda",
    });
    await expect(nav.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "href",
      `/${store.slug}`
    );
    await expect(nav.getByRole("link", { name: "Catálogo" })).toHaveAttribute(
      "href",
      `/${store.slug}/products`
    );
    await expect(header.getByRole("search").locator("form")).toHaveAttribute(
      "action",
      `/${store.slug}/products`
    );

    // The first Tab of the page reaches the skip link, which moves focus to
    // the page's content.
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Saltar al contenido" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#store-main")).toBeFocused();
  });

  test("an address under a store that nothing answers is a 404 inside the store's shell", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore({ name: "Shell Store" }, TEXTS);

    const response = await page.goto(`/${store.slug}/no-such-page`);

    expect(response?.status()).toBe(404);
    const storePage = new StorePage(page, store.slug);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "No encontramos esta página",
      })
    ).toBeVisible();
    await expect(storePage.getSiteHeader()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Volver al inicio de la tienda" })
    ).toHaveAttribute("href", `/${store.slug}`);
  });

  test("the language toggle keeps the store", async ({ db, page }) => {
    const store = await db.seed.createStore({ name: "Shell Store" }, TEXTS);
    const storePage = new StorePage(page, store.slug);
    await storePage.goto();

    const toggle = storePage.getSiteHeader().getByRole("link", {
      name: "English",
    });
    // React reads the URL before the link carries it (src/e2e/AGENTS.md).
    await expect(toggle).toHaveAttribute("href", `/en/${store.slug}`);
    await toggle.click();

    await expect(page).toHaveURL(new RegExp(`/en/${store.slug}$`, "u"));
    await expect(storePage.getFooter()).toContainText("Jewelry at the fair");
    const back = storePage.getSiteHeader().getByRole("link", {
      name: "Español",
    });
    await expect(back).toHaveAttribute("href", `/${store.slug}`);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { height: 812, width: 375 } });

    test("the menu opens full screen with the links, and closes with its button and with Escape", async ({
      db,
      page,
    }) => {
      const store = await db.seed.createStore({ name: "Shell Store" }, TEXTS);
      const storePage = new StorePage(page, store.slug);
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
    db,
    page,
  }) => {
    const store = await db.seed.createStore(
      {
        instagramUrl: "https://instagram.com/shell-store",
        name: "Shell Store",
        whatsappNumber: "+59899123456",
      },
      TEXTS
    );
    const storePage = new StorePage(page, store.slug);
    await storePage.goto();
    const footer = storePage.getFooter();

    await expect(footer).toContainText("Joyas en la feria");
    await expect(
      footer.getByRole("link", { name: "Instagram de Shell Store" })
    ).toHaveAttribute("href", "https://instagram.com/shell-store");
    await expect(
      footer.getByRole("link", { name: "Escribinos por WhatsApp" })
    ).toHaveAttribute("href", "https://wa.me/59899123456");
    await expect(footer.getByRole("link", { name: /TikTok/u })).toHaveCount(0);
    await expect(
      footer.getByRole("link", { name: "Hecho por Lucas Regalado" })
    ).toHaveAttribute("href", "https://lucasregalado.com");
  });

  test("the cart button says how many units the browser's cart holds", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore({ name: "Shell Store" }, TEXTS);
    const storePage = new StorePage(page, store.slug);
    await storePage.goto();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, vacío"
    );

    await page.evaluate((key) => {
      localStorage.setItem(
        key,
        JSON.stringify([
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 1 },
        ])
      );
    }, `feria:cart:${store.slug}`);
    await storePage.goto();

    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 3 unidades"
    );
    await expect(storePage.getCartButton()).toHaveAttribute(
      "href",
      `/${store.slug}/cart`
    );
  });
});
