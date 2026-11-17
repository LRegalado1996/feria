import type { Page } from "@playwright/test";

import {
  type DbFixture,
  expect,
  IGNORE_HTTPS_ERRORS,
  ordersHolding,
  requireBaseURL,
  test,
  uniquePhone,
  uniqueTag,
} from "../../fixtures";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { StorePage } from "../../page-objects/store.page";

// FER-045. Each test seeds articles of its own, in a category of its own;
// the cart lives in the browser, one per test's page. The db fixture deletes
// the order the end-to-end test places, with its articles.
test.use({ storageState: { cookies: [], origins: [] } });

const CART_KEY = "feria:cart";
const ORDER_CREATE = "/api/orpc/order/create";

/** A necklace and a bracelet in a category of the test's own. */
async function setup({ db }: { db: DbFixture["db"] }) {
  const tag = uniqueTag();
  const jewels = await db.seed.createCategory({
    nameEs: `Joyas ${tag}`,
    slug: `joyas-${tag}`,
  });
  const [necklace, bracelet] = await Promise.all([
    db.seed.createArticle({
      categoryId: jewels.id,
      images: 2,
      priceAmount: 120_000,
      title: "Collar dorado",
    }),
    db.seed.createArticle({
      categoryId: jewels.id,
      priceAmount: 54_000,
      title: "Pulsera violeta",
    }),
  ]);

  return { bracelet, necklace };
}

/** Puts a cart in the browser, as adding would have, then opens `path`. */
async function openWithCart(
  page: Page,
  path: string,
  items: { productId: number; quantity: number }[]
) {
  // On the store's origin first: storage belongs to it.
  await new StorePage(page).goto();
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [CART_KEY, JSON.stringify(items)] as const
  );
  await page.goto(path);
}

/** The article's "Agregar al carrito", once React owns it. */
async function liveAddButton(page: Page) {
  const add = page.getByRole("button", {
    exact: true,
    name: "Agregar al carrito",
  });
  // Enabled only once React owns it; a retried click would add twice.
  await expect(add).toBeEnabled();

  return add;
}

test.describe("Cart panel", () => {
  test("adding from the article page opens the panel with that line, marked, and says so", async ({
    db,
    page,
  }) => {
    const { necklace } = await setup({ db });
    const storePage = new StorePage(page);
    await page.goto(`/productos/${necklace.slug}`);

    await (await liveAddButton(page)).click();

    const panel = storePage.getCartPanel();
    await expect(
      page.getByRole("dialog", { name: "Tu carrito, 1 unidad" })
    ).toBeVisible();
    await expect(panel.getByTestId("store-cart-panel-status")).toHaveText(
      "Agregaste Collar dorado al carrito."
    );
    const line = storePage.getCartPanelLine("Collar dorado");
    await expect(line).toHaveAttribute("data-just-added", "");
    await expect(line.getByTestId("store-cart-quantity")).toHaveText("1");
    await expect(line).toContainText("$ 1.200 c/u");
    await expect(panel.getByTestId("store-cart-panel-total")).toHaveText(
      "Total$ 1.200"
    );
    // Focus moved in, onto its close button.
    await expect(panel.getByRole("button", { name: "Cerrar" })).toBeFocused();
    await expect(panel.getByTestId("store-cart-panel-count")).toHaveText("(1)");
    // It slid in, its count bumped, and the line rose under a fading wash.
    expect(
      await page.evaluate(() =>
        [
          '[data-testid="store-cart-panel"]',
          '[data-testid="dialog-overlay"]',
          '[data-testid="store-cart-panel-count"]',
          "[data-just-added] > div",
          '[data-slot="store-cart-line-wash"]',
        ].map((selector) => {
          const element = document.querySelector(selector);

          return element ? getComputedStyle(element).animationName : null;
        })
      )
    ).toEqual([
      "store-panel-in",
      "store-scrim-in",
      "store-bump",
      "store-rise",
      "store-wash",
    ]);
  });

  test("a quantity changed and a line taken out in the panel change the cart", async ({
    db,
    page,
  }) => {
    const { bracelet, necklace } = await setup({ db });
    const storePage = new StorePage(page);
    await openWithCart(page, "/", [
      { productId: necklace.id, quantity: 1 },
      { productId: bracelet.id, quantity: 1 },
    ]);
    await (await storePage.getLiveCartButton()).click();
    const panel = storePage.getCartPanel();
    const total = panel.getByTestId("store-cart-panel-total");
    await expect(total).toHaveText("Total$ 1.740");

    await storePage
      .getCartPanelLine("Collar dorado")
      .getByRole("button", { name: "Una unidad más de Collar dorado" })
      .click();

    await expect(
      storePage
        .getCartPanelLine("Collar dorado")
        .getByTestId("store-cart-quantity")
    ).toHaveText("2");
    await expect(total).toHaveText("Total$ 2.940");
    await expect(
      page.getByRole("dialog", { name: "Tu carrito, 3 unidades" })
    ).toBeVisible();

    await storePage
      .getCartPanelLine("Pulsera violeta")
      .getByRole("button", { name: "Quitar Pulsera violeta" })
      .click();

    await expect(storePage.getCartPanelLine("Pulsera violeta")).toHaveCount(0);
    await expect(total).toHaveText("Total$ 2.400");
    // Focus goes to the line now in its place, never to the page's top.
    await expect(
      panel.getByRole("button", { name: "Quitar Collar dorado" })
    ).toBeFocused();
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), CART_KEY)
    ).toBe(JSON.stringify([{ productId: necklace.id, quantity: 2 }]));

    await storePage.closeCartPanel();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 2 unidades"
    );
  });

  test("the header's cart opens the panel on any page, and Escape closes it back to the cart", async ({
    db,
    page,
  }) => {
    const { necklace } = await setup({ db });
    const storePage = new StorePage(page);
    await openWithCart(page, "/productos", [
      { productId: necklace.id, quantity: 2 },
    ]);
    const cart = await storePage.getLiveCartButton();

    await cart.click();

    const panel = storePage.getCartPanel();
    await expect(
      page.getByRole("dialog", { name: "Tu carrito, 2 unidades" })
    ).toBeVisible();
    await expect(storePage.getCartPanelLine("Collar dorado")).toBeVisible();
    // Opened from the header, it says nothing of adding.
    await expect(panel.getByTestId("store-cart-panel-status")).toHaveCount(0);
    await expect(page).toHaveURL("/productos");

    await page.keyboard.press("Escape");

    await expectDialogRemoved(page, panel);
    await expect(cart).toBeFocused();
  });

  test("the dimmed page closes it and gives focus back to the add button", async ({
    db,
    page,
  }) => {
    const { necklace } = await setup({ db });
    const storePage = new StorePage(page);
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto(`/productos/${necklace.slug}`);
    const add = await liveAddButton(page);
    await add.click();
    const panel = storePage.getCartPanel();
    await expect(storePage.getCartPanelLine("Collar dorado")).toBeVisible();
    // The panel takes the right of the screen, once it has slid in; the
    // scrim, the rest.
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();

        return [box?.x, box?.width];
      })
      .toEqual([960, 480]);

    await page
      .getByTestId("dialog-overlay")
      .click({ position: { x: 200, y: 450 } });

    await expectDialogRemoved(page, panel);
    await expect(add).toBeFocused();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 1 unidad"
    );
  });

  test("“Hacer el pedido” leads to the checkout, where the order is placed end to end", async ({
    db,
    page,
  }) => {
    const { necklace } = await setup({ db });
    const storePage = new StorePage(page);
    const phone = uniquePhone();
    await page.goto(`/productos/${necklace.slug}`);
    await (await liveAddButton(page)).click();
    const panel = storePage.getCartPanel();
    await expect(storePage.getCartPanelLine("Collar dorado")).toBeVisible();

    await panel.getByRole("link", { name: "Hacer el pedido" }).click();

    await expect(page).toHaveURL("/cart");
    // Closed at once: nothing of the panel is left over the checkout.
    await expectDialogRemoved(page, panel);
    const checkout = page.getByTestId("store-checkout");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tu pedido" })
    ).toBeVisible();
    await expect(checkout.getByTestId("store-cart-line")).toHaveText(
      /Collar dorado1 × \$\s1\.200\$\s1\.200/u
    );
    await expect(checkout.getByTestId("store-checkout-total")).toHaveText(
      "Total$ 1.200"
    );
    await expect(page.getByTestId("store-checkout-submit")).toBeEnabled();
    await page.getByLabel("Tu nombre").fill("Ana Prueba");
    await page.getByLabel("Tu celular").fill(phone.local);

    await completeRpcAction(
      page,
      ORDER_CREATE,
      async () => {
        await new StorePage(page).submitAndConfirmOrder();
      },
      { input: { customerName: "Ana Prueba", customerPhone: phone.local } }
    );

    const [placed] = await ordersHolding(db.drizzle, [necklace.id]);
    await expect(page).toHaveURL(`/orders/${placed?.token ?? ""}`);
    const order = page.getByTestId("store-order-page");
    await expect(order.getByTestId("store-order-banner")).toContainText(
      "¡Recibimos tu pedido!"
    );
    await expect(order.getByRole("listitem")).toHaveText([
      "1 × Collar dorado$ 1.200",
    ]);
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, vacío"
    );
  });

  test("on the checkout, “Editar el carrito” opens the panel over the page and the summary follows it", async ({
    db,
    page,
  }) => {
    const { bracelet, necklace } = await setup({ db });
    const storePage = new StorePage(page);
    await openWithCart(page, "/cart", [
      { productId: necklace.id, quantity: 1 },
      { productId: bracelet.id, quantity: 1 },
    ]);
    const edit = page.getByTestId("store-checkout-edit");
    const total = page.getByTestId("store-checkout-total");
    await expect(total).toHaveText("Total$ 1.740");

    await edit.click();
    await storePage
      .getCartPanelLine("Pulsera violeta")
      .getByRole("button", { name: "Quitar Pulsera violeta" })
      .click();
    await expect(storePage.getCartPanelLine("Pulsera violeta")).toHaveCount(0);
    // Already on the checkout: "Hacer el pedido" only closes the panel.
    await storePage
      .getCartPanel()
      .getByRole("link", { name: "Hacer el pedido" })
      .click();

    await expectDialogRemoved(page, storePage.getCartPanel());
    await expect(page).toHaveURL("/cart");
    await expect(edit).toBeFocused();
    await expect(total).toHaveText("Total$ 1.200");
    await expect(page.getByTestId("store-cart-line")).toHaveCount(1);
  });

  test("at 375 px the panel takes the whole width, with nothing to scroll sideways", async ({
    db,
    page,
  }) => {
    const { necklace } = await setup({ db });
    const storePage = new StorePage(page);
    await page.setViewportSize({ height: 812, width: 375 });
    await openWithCart(page, "/", [{ productId: necklace.id, quantity: 1 }]);

    await (await storePage.getLiveCartButton()).click();

    const panel = storePage.getCartPanel();
    await expect(storePage.getCartPanelLine("Collar dorado")).toBeVisible();
    // Once it has slid in.
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();

        return [box?.x, box?.width];
      })
      .toEqual([0, 375]);
    await storePage.expectNoHorizontalScroll();
    // Its controls are thumb-sized.
    for (const name of [
      "Cerrar",
      "Una unidad más de Collar dorado",
      "Quitar Collar dorado",
      "Seguir comprando",
    ]) {
      const control = await panel.getByRole("button", { name }).boundingBox();
      expect(control?.height).toBeGreaterThanOrEqual(44);
    }
  });

  test("under reduced motion the panel just appears, and nothing in it moves", async ({
    db,
    page,
  }) => {
    const { necklace } = await setup({ db });
    const storePage = new StorePage(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/productos/${necklace.slug}`);

    await (await liveAddButton(page)).click();

    const panel = storePage.getCartPanel();
    const line = storePage.getCartPanelLine("Collar dorado");
    await expect(line).toHaveAttribute("data-just-added", "");
    const animations = await page.evaluate(() =>
      [
        '[data-testid="store-cart-panel"]',
        '[data-testid="dialog-overlay"]',
        '[data-testid="store-cart-panel-count"]',
        "[data-just-added] > div",
      ].map((selector) => {
        const element = document.querySelector(selector);

        return element ? getComputedStyle(element).animationName : null;
      })
    );
    expect(animations).toEqual(["none", "none", "none", "none"]);
    // The wash is not drawn at all.
    await expect(
      panel.locator('[data-slot="store-cart-line-wash"]')
    ).toBeHidden();
  });

  test("with scripts off, the header's cart leads to the checkout page", async ({
    baseURL,
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: requireBaseURL(baseURL),
      ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto("/");

    await page.getByTestId("store-cart-button").first().click();

    await expect(page).toHaveURL("/cart");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tu pedido" })
    ).toBeVisible();
    await context.close();
  });
});
