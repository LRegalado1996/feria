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
import { StorePage } from "../../page-objects/store.page";

// FER-026. Each test seeds articles of its own, in a category of its own,
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

/** A cart line, by the article's title. */
function cartLine(page: Page, title: string) {
  return page.getByTestId("store-cart-line").filter({ hasText: title });
}

/**
 * Adds the necklace from its category in the catalog and the bracelet from
 * its own page.
 */
async function addBothArticles(
  page: Page,
  { braceletSlug, category }: { braceletSlug: string; category: string }
) {
  const storePage = new StorePage(page);
  await page.goto(`/${category}`);
  const addNecklace = page.getByRole("button", {
    name: "Agregar al carrito: Collar dorado",
  });
  // Enabled only once React owns it; a retried click would add twice.
  await expect(addNecklace).toBeEnabled();
  await addNecklace.click();
  await expect(storePage.getCartButton()).toHaveAccessibleName(
    "Carrito, 1 unidad"
  );

  await page.goto(`/products/${braceletSlug}`);
  const addBracelet = page.getByRole("button", {
    exact: true,
    name: "Agregar al carrito",
  });
  await expect(addBracelet).toBeEnabled();
  await addBracelet.click();
  await expect(storePage.getCartButton()).toHaveAccessibleName(
    "Carrito, 2 unidades"
  );
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
    const { bracelet, jewels, orders, phone } = await setup({ db });
    const storePage = new StorePage(page);
    await addBothArticles(page, {
      braceletSlug: bracelet.slug,
      category: jewels.slug,
    });

    await storePage.getCartButton().click();
    await expect(page).toHaveURL("/cart");
    const necklaceLine = cartLine(page, "Collar dorado");
    await expect(necklaceLine.getByTestId("store-cart-quantity")).toHaveText(
      "1"
    );
    await necklaceLine
      .getByRole("button", { name: "Una unidad más de Collar dorado" })
      .click();
    await expect(necklaceLine.getByTestId("store-cart-quantity")).toHaveText(
      "2"
    );
    await expect(
      cartLine(page, "Pulsera violeta").getByTestId("store-cart-quantity")
    ).toHaveText("1");
    await expect(page.getByTestId("store-cart-total")).toHaveText(
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
    await expect(page.getByTestId("store-cart-empty")).toContainText(
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
    await expect(page.getByTestId("store-cart-total")).toHaveText(
      "Total$ 1.200"
    );

    await soldOut
      .getByRole("button", { name: "Quitar Pulsera violeta" })
      .click();

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

    await cartLine(page, "Pulsera violeta")
      .getByRole("button", { name: "Quitar Pulsera violeta" })
      .click();

    await expect(
      page.getByTestId("store-cart").getByRole("alert")
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
    await expect(page.getByTestId("store-cart-total")).toHaveText(
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

  test("in English, the cart speaks English, from the same cart as the Spanish pages", async ({
    db,
    page,
  }) => {
    const { necklace } = await setup({ db });
    await openCartWith(page, "/en/cart", [
      { productId: necklace.id, quantity: 2 },
    ]);
    const line = cartLine(page, "Collar dorado");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your cart"
    );
    await expect(line).toContainText("UYU 1,200 each");
    await expect(
      line.getByRole("button", { name: "One unit more of Collar dorado" })
    ).toBeVisible();
    await expect(page.getByTestId("store-cart-total")).toHaveText(
      "TotalUYU 2,400"
    );
    await expect(
      page.getByRole("heading", { level: 2, name: "Your details" })
    ).toBeVisible();
    await expect(page.getByLabel("Your mobile")).toBeVisible();
    await expect(page.getByTestId("store-checkout-submit")).toHaveText(
      "Place order"
    );
    await expect(page).toHaveTitle(`Your cart · ${STORE_SETTINGS.name}`);
  });
});
