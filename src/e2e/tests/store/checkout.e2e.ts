import type { Page, Request } from "@playwright/test";

import {
  type DbFixture,
  expect,
  ordersHolding,
  STORE_SETTINGS,
  test,
  uniquePhone,
  uniqueTag,
} from "../../fixtures";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { StorePage } from "../../page-objects/store.page";

// FER-026, FER-045: the cart is a side panel, the checkout its own page.
// Each test seeds articles of its own, in a category of its own,
// and orders from a phone of its own: the hourly limit counts a phone across
// the store every spec shares (FER-038). The db fixture deletes the orders
// holding the test's articles, and the ones its pages placed.
test.use({ storageState: { cookies: [], origins: [] } });

const ORDER_CREATE = "/api/orpc/order/create";
const CART_PRODUCTS = "**/api/orpc/catalog/cartProducts";
const CART_KEY = "feria:cart";

/** A necklace and a bracelet in a category of the test's own. */
async function setup(
  { db }: { db: DbFixture["db"] },
  { braceletSoldOut = false }: { braceletSoldOut?: boolean } = {}
) {
  const tag = uniqueTag();
  const jewels = await db.seed.createCategory({
    nameEs: `Joyas ${tag}`,
    slug: `joyas-${tag}`,
  });
  const necklace = await db.seed.createArticle({
    categoryId: jewels.id,
    priceAmount: 120_000,
    title: "Collar dorado",
  });
  const bracelet = await db.seed.createArticle({
    categoryId: jewels.id,
    isAvailable: !braceletSoldOut,
    priceAmount: 54_000,
    title: "Pulsera violeta",
  });

  return {
    bracelet,
    jewels,
    necklace,
    /** The test's orders, straight from the database. */
    orders: async () =>
      await ordersHolding(db.drizzle, [necklace.id, bracelet.id]),
    phone: uniquePhone(),
  };
}

/** Puts a cart in the browser, as adding would have, then opens `path`. */
async function openCartWith(
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

/** A line of the checkout's summary, by the article's title. */
function cartLine(page: Page, title: string) {
  return page
    .getByTestId("store-checkout")
    .getByTestId("store-cart-line")
    .filter({ hasText: title });
}

/**
 * Adds the necklace and the bracelet, each from its own page: a card in the
 * catalog is a link to the article, and adding happens there (FER-039).
 * Each add opens the cart's side panel (FER-045), named after its units.
 */
async function addBothArticles(
  page: Page,
  { braceletSlug, necklaceSlug }: { braceletSlug: string; necklaceSlug: string }
) {
  for (const [slug, units] of [
    [necklaceSlug, "Tu carrito, 1 unidad"],
    [braceletSlug, "Tu carrito, 2 unidades"],
  ] as const) {
    await page.goto(`/productos/${slug}`);
    const add = page.getByRole("button", {
      exact: true,
      name: "Agregar al carrito",
    });
    // Enabled only once React owns it; a retried click would add twice.
    await expect(add).toBeEnabled();
    await add.click();
    await expect(page.getByRole("dialog", { name: units })).toBeVisible();
  }
}

/** Opens the side panel from the checkout's "Editar el carrito". */
async function editCart(page: Page) {
  await page.getByTestId("store-checkout-edit").click();
  const panel = new StorePage(page).getCartPanel();
  await expect(panel).toBeVisible();

  return panel;
}

/** Fills the checkout once React owns the form. */
async function fillCheckout(page: Page, phone: string) {
  // Enabled only once React owns the form: a value typed before is lost.
  await expect(page.getByTestId("store-checkout-submit")).toBeEnabled();
  await page.getByLabel("Tu nombre").fill("Ana Prueba");
  await page.getByLabel("Tu celular").fill(phone);
  await page
    .getByLabel("Nota para la tienda (opcional)")
    .fill("Paso a la tarde.");
}

test.describe("Cart and checkout", () => {
  test("adds two articles, changes a quantity, places the order and lands on its page", async ({
    db,
    page,
  }) => {
    const { bracelet, necklace, orders, phone } = await setup({ db });
    const storePage = new StorePage(page);
    await addBothArticles(page, {
      braceletSlug: bracelet.slug,
      necklaceSlug: necklace.slug,
    });

    // The quantity changes in the panel the second add opened.
    const necklaceLine = storePage.getCartPanelLine("Collar dorado");
    await expect(necklaceLine.getByTestId("store-cart-quantity")).toHaveText(
      "1"
    );
    await necklaceLine
      .getByRole("button", { name: "Una unidad más de Collar dorado" })
      .click();
    await expect(necklaceLine.getByTestId("store-cart-quantity")).toHaveText(
      "2"
    );
    await storePage
      .getCartPanel()
      .getByRole("link", { name: "Hacer el pedido" })
      .click();
    await expect(page).toHaveURL("/cart");
    await expect(
      cartLine(page, "Collar dorado").getByTestId("store-cart-line-price")
    ).toHaveText(/^2 × \$\s1\.200$/u);
    await expect(
      cartLine(page, "Pulsera violeta").getByTestId("store-cart-line-price")
    ).toHaveText(/^1 × \$\s540$/u);
    await expect(page.getByTestId("store-checkout-total")).toHaveText(
      "Total$ 2.940"
    );
    await fillCheckout(page, phone.local);

    await completeRpcAction(
      page,
      ORDER_CREATE,
      async () => {
        await page.getByTestId("store-checkout-submit").click();
      },
      {
        input: {
          customerName: "Ana Prueba",
          customerPhone: phone.local,
          note: "Paso a la tarde.",
        },
      }
    );

    const [placed] = await orders();
    await expect(page).toHaveURL(`/orders/${placed?.token ?? ""}`);
    const order = page.getByTestId("store-order-page");
    await expect(order.getByTestId("store-order-banner")).toContainText(
      "¡Recibimos tu pedido!"
    );
    await expect(order.getByTestId("store-order-code")).toHaveText(
      placed?.code ?? ""
    );
    await expect(order.getByTestId("store-order-code")).toHaveText(
      /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u
    );
    await expect(
      order.getByRole("listitem").filter({ hasText: "Collar dorado" })
    ).toHaveText("2 × Collar dorado$ 2.400");
    await expect(
      order.getByRole("listitem").filter({ hasText: "Pulsera violeta" })
    ).toHaveText("1 × Pulsera violeta$ 540");
    await expect(order.getByTestId("store-order-total")).toHaveText(
      "Total$ 2.940"
    );
    // The phone shows only its country code and its last three digits.
    await expect(order).toContainText(`+598•••••${phone.national.slice(-3)}`);
    await expect(order).not.toContainText(phone.national);
    await expect(order.getByTestId("store-order-status")).toHaveText(
      "Recibido: la tienda lo va a preparar"
    );
    await expect(order).toContainText("Paso a la tarde.");
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, vacío"
    );
    // The address is the order's key: no link followed from it sends it on.
    await expect
      .poll(
        async () =>
          await page.evaluate(() =>
            [...document.querySelectorAll("[name='referrer']")].map((meta) =>
              meta.getAttribute("content")
            )
          )
      )
      .toEqual(["no-referrer"]);
  });

  test("a double tap on the submit places one order, and the cart is empty afterwards", async ({
    db,
    page,
  }) => {
    const { necklace, orders, phone } = await setup({ db });
    await openCartWith(page, "/cart", [
      { productId: necklace.id, quantity: 1 },
    ]);
    await fillCheckout(page, phone.local);
    // Every order request this page sends, caught as it starts so one still
    // waiting for its answer is counted too.
    const sent: Request[] = [];
    page.on("request", (request: Request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === ORDER_CREATE
      ) {
        sent.push(request);
      }
    });

    await completeRpcAction(
      page,
      ORDER_CREATE,
      async () => {
        await page.getByTestId("store-checkout-submit").dblclick();
      },
      { input: { customerName: "Ana Prueba", customerPhone: phone.local } }
    );
    await expect(page.getByTestId("store-order-code")).toBeVisible();
    // Each one answered in full, so a second order would be in the table.
    await Promise.all(
      sent.map(async (request) => {
        const response = await request.response();
        await response?.finished();
      })
    );

    const placed = await orders();
    expect(placed).toHaveLength(1);
    await expect(page.getByTestId("store-order-code")).toHaveText(
      placed[0]?.code ?? ""
    );
    await expect(page).toHaveURL(`/orders/${placed[0]?.token ?? ""}`);

    await page.goBack();
    await expect(page).toHaveURL("/cart");
    await expect(page.getByTestId("store-checkout-empty")).toContainText(
      "Tu carrito está vacío."
    );
    expect(await orders()).toHaveLength(1);
  });

  test("a sold-out article holds the order until it is taken out", async ({
    db,
    page,
  }) => {
    const { bracelet, necklace } = await setup(
      { db },
      { braceletSoldOut: true }
    );
    await openCartWith(page, "/cart", [
      { productId: necklace.id, quantity: 1 },
      { productId: bracelet.id, quantity: 2 },
    ]);
    const soldOut = cartLine(page, "Pulsera violeta");
    const submit = page.getByTestId("store-checkout-submit");

    await expect(soldOut).toHaveAttribute("data-flag", "unavailable");
    await expect(soldOut).toContainText("Agotado por ahora.");
    await expect(
      page.getByText(
        "Quitá los artículos que ya no se pueden comprar para hacer el pedido."
      )
    ).toBeVisible();
    await expect(submit).toBeDisabled();
    // Its price is not in the order's total.
    await expect(page.getByTestId("store-checkout-total")).toHaveText(
      "Total$ 1.200"
    );

    // Taken out in the side panel, which flags it the same way.
    const panel = await editCart(page);
    const inPanel = new StorePage(page).getCartPanelLine("Pulsera violeta");
    await expect(inPanel).toHaveAttribute("data-flag", "unavailable");
    await expect(panel.getByTestId("store-cart-panel-checkout")).toBeDisabled();
    await inPanel
      .getByRole("button", { name: "Quitar Pulsera violeta" })
      .click();
    await expect(inPanel).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expectDialogRemoved(page, panel);

    await expect(soldOut).toHaveCount(0);
    await expect(
      page.getByText(
        "Quitá los artículos que ya no se pueden comprar para hacer el pedido."
      )
    ).toHaveCount(0);
    await expect(submit).toBeEnabled();
  });

  test("prices that fail to load after a line is taken out keep what the shopper typed, and the order goes through after a retry", async ({
    db,
    page,
  }) => {
    const { bracelet, necklace, phone } = await setup({ db });
    await openCartWith(page, "/cart", [
      { productId: necklace.id, quantity: 1 },
      { productId: bracelet.id, quantity: 1 },
    ]);
    await fillCheckout(page, phone.local);
    const submit = page.getByTestId("store-checkout-submit");
    await page.route(CART_PRODUCTS, async (route) => {
      await route.abort("failed");
    });

    const panel = await editCart(page);
    await new StorePage(page)
      .getCartPanelLine("Pulsera violeta")
      .getByRole("button", { name: "Quitar Pulsera violeta" })
      .click();
    await expect(panel.getByRole("alert")).toContainText(
      "No pudimos traer los precios de ahora."
    );
    await page.keyboard.press("Escape");
    await expectDialogRemoved(page, panel);

    await expect(
      page.getByTestId("store-checkout").getByRole("alert")
    ).toContainText("No pudimos traer los precios de ahora.");
    await expect(page.getByLabel("Tu nombre")).toHaveValue("Ana Prueba");
    await expect(page.getByLabel("Tu celular")).toHaveValue(phone.local);
    await expect(page.getByLabel("Nota para la tienda (opcional)")).toHaveValue(
      "Paso a la tarde."
    );
    await expect(submit).toBeDisabled();

    await page.unroute(CART_PRODUCTS);
    await page.getByRole("button", { name: "Probar de nuevo" }).click();
    await expect(cartLine(page, "Collar dorado")).toBeVisible();
    await expect(page.getByTestId("store-checkout-total")).toHaveText(
      "Total$ 1.200"
    );

    await completeRpcAction(
      page,
      ORDER_CREATE,
      async () => {
        await submit.click();
      },
      {
        input: {
          customerName: "Ana Prueba",
          customerPhone: phone.local,
          note: "Paso a la tarde.",
        },
      }
    );
    const order = page.getByTestId("store-order-page");
    await expect(order.getByRole("listitem")).toHaveText([
      "1 × Collar dorado$ 1.200",
    ]);
    await expect(order).toContainText("Paso a la tarde.");
  });

  test("in English, the checkout and its panel speak English, from the same cart as the Spanish pages", async ({
    db,
    page,
  }) => {
    const { necklace } = await setup({ db });
    await openCartWith(page, "/en/cart", [
      { productId: necklace.id, quantity: 2 },
    ]);
    const line = cartLine(page, "Collar dorado");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your order"
    );
    await expect(line.getByTestId("store-cart-line-price")).toHaveText(
      "2 × UYU 1,200"
    );
    await expect(page.getByTestId("store-checkout-total")).toHaveText(
      "TotalUYU 2,400"
    );
    await page.getByRole("button", { name: "Edit the cart" }).click();
    const panel = new StorePage(page).getCartPanel();
    await expect(
      page.getByRole("dialog", { name: "Your cart, 2 units" })
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "One unit more of Collar dorado" })
    ).toBeVisible();
    await expect(
      panel.getByRole("link", { name: "Place the order" })
    ).toHaveAttribute("href", "/en/cart");
    await panel.getByRole("button", { name: "Keep shopping" }).click();
    await expectDialogRemoved(page, panel);
    await expect(
      page.getByRole("heading", { level: 2, name: "Your details" })
    ).toBeVisible();
    await expect(page.getByLabel("Your mobile")).toBeVisible();
    await expect(page.getByTestId("store-checkout-submit")).toHaveText(
      "Place the order"
    );
    await expect(page).toHaveTitle(`Your order · ${STORE_SETTINGS.name}`);
  });
});
