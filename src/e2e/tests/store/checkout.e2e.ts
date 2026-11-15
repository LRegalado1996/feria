import type { Page, Request } from "@playwright/test";
import { eq } from "drizzle-orm";

import { customerOrder } from "../../../server/db/schema";
import { type DbFixture, expect, test } from "../../fixtures";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { StorePage } from "../../page-objects/store.page";

// FER-026. Each test seeds its own store and articles; the orders its pages
// place are deleted with the store (`customer_order.storeId` cascades, and
// from it the order's items and status history).
test.use({ storageState: { cookies: [], origins: [] } });

const ORDER_CREATE = "/api/orpc/order/create";

/** A store with a necklace and a bracelet, the bracelet sold out if asked. */
async function setup(
  { db }: { db: DbFixture["db"] },
  { braceletSoldOut = false }: { braceletSoldOut?: boolean } = {}
) {
  const store = await db.seed.createStore({ name: "Checkout Store" });
  const jewels = await db.seed.createCategory(store.id, {
    nameEs: "Joyas",
    position: 0,
    slug: "joyas",
  });
  const necklace = await db.seed.createArticle(
    store.id,
    jewels.id,
    "Collar dorado",
    { priceAmount: 120_000 }
  );
  const bracelet = await db.seed.createArticle(
    store.id,
    jewels.id,
    "Pulsera violeta",
    { isAvailable: !braceletSoldOut, priceAmount: 54_000 }
  );

  return {
    bracelet,
    necklace,
    store,
    storePage: (page: Page) => new StorePage(page, store.slug),
    /** The store's orders, straight from the database. */
    orders: async () =>
      await db.drizzle
        .select({ code: customerOrder.code, token: customerOrder.token })
        .from(customerOrder)
        .where(eq(customerOrder.storeId, store.id)),
  };
}

/** Puts a cart in the browser, as adding would have, then opens it. */
async function openCartWith(
  page: Page,
  path: string,
  storeSlug: string,
  items: { productId: number; quantity: number }[]
) {
  // On the store's origin first: storage belongs to it.
  await page.goto(`/${storeSlug}/products`);
  await page.evaluate(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [`feria:cart:${storeSlug}`, JSON.stringify(items)] as const
  );
  await page.goto(path);
}

/** A cart line, by the article's title. */
function cartLine(page: Page, title: string) {
  return page.getByTestId("store-cart-line").filter({ hasText: title });
}

/** Adds the necklace from the catalog and the bracelet from its own page. */
async function addBothArticles(
  page: Page,
  { braceletSlug, storeSlug }: { braceletSlug: string; storeSlug: string }
) {
  const storePage = new StorePage(page, storeSlug);
  await page.goto(`/${storeSlug}/products`);
  const addNecklace = page.getByRole("button", {
    name: "Agregar al carrito: Collar dorado",
  });
  // Enabled only once React owns it; a retried click would add twice.
  await expect(addNecklace).toBeEnabled();
  await addNecklace.click();
  await expect(storePage.getCartButton()).toHaveAccessibleName(
    "Carrito, 1 unidad"
  );

  await page.goto(`/${storeSlug}/products/${braceletSlug}`);
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
async function fillCheckout(page: Page) {
  // Enabled only once React owns the form: a value typed before is lost.
  await expect(page.getByTestId("store-checkout-submit")).toBeEnabled();
  await page.getByLabel("Tu nombre").fill("Ana Prueba");
  await page.getByLabel("Tu celular").fill("099 123 456");
  await page
    .getByLabel("Nota para la tienda (opcional)")
    .fill("Paso a la tarde.");
}

test.describe("Cart and checkout", () => {
  test("adds two articles, changes a quantity, places the order and lands on its page", async ({
    db,
    page,
  }) => {
    const { bracelet, store, storePage } = await setup({ db });
    await addBothArticles(page, {
      braceletSlug: bracelet.slug,
      storeSlug: store.slug,
    });

    await storePage(page).getCartButton().click();
    await expect(page).toHaveURL(`/${store.slug}/cart`);
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
    await fillCheckout(page);

    await completeRpcAction(
      page,
      ORDER_CREATE,
      async () => {
        await page.getByTestId("store-checkout-submit").click();
      },
      {
        input: {
          customerName: "Ana Prueba",
          customerPhone: "099 123 456",
          note: "Paso a la tarde.",
          storeSlug: store.slug,
        },
      }
    );

    await expect(page).toHaveURL(
      new RegExp(`/${store.slug}/orders/[A-Za-z0-9_-]{43}$`, "u")
    );
    const order = page.getByTestId("store-order-page");
    await expect(order.getByTestId("store-order-banner")).toContainText(
      "¡Recibimos tu pedido!"
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
    await expect(order).toContainText("+598•••••456");
    await expect(order).not.toContainText("99123456");
    await expect(order.getByTestId("store-order-status")).toHaveText(
      "Recibido: la tienda lo va a preparar"
    );
    await expect(order).toContainText("Paso a la tarde.");
    await expect(storePage(page).getCartButton()).toHaveAccessibleName(
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
    const { necklace, orders, store } = await setup({ db });
    await openCartWith(page, `/${store.slug}/cart`, store.slug, [
      { productId: necklace.id, quantity: 1 },
    ]);
    await fillCheckout(page);
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
      { input: { customerName: "Ana Prueba", storeSlug: store.slug } }
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
    await expect(page).toHaveURL(
      `/${store.slug}/orders/${placed[0]?.token ?? ""}`
    );

    await page.goBack();
    await expect(page).toHaveURL(`/${store.slug}/cart`);
    await expect(page.getByTestId("store-cart-empty")).toContainText(
      "Tu carrito está vacío."
    );
    expect(await orders()).toHaveLength(1);
  });

  test("a sold-out article holds the order until it is taken out", async ({
    db,
    page,
  }) => {
    const { bracelet, necklace, store } = await setup(
      { db },
      { braceletSoldOut: true }
    );
    await openCartWith(page, `/${store.slug}/cart`, store.slug, [
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

  test("in English, the cart speaks English", async ({ db, page }) => {
    const { necklace, store } = await setup({ db });
    await openCartWith(page, `/en/${store.slug}/cart`, store.slug, [
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
    await expect(page).toHaveTitle(/^Your cart/u);
  });
});
