import { randomInt } from "node:crypto";

import type { Page } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";

import { customerOrder, orderStatusEvent } from "../../../server/db/schema";
import { type DbFixture, expect, test } from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import type { SeededLogin } from "../../fixtures/db.fixture";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";
import { StorePage } from "../../page-objects/store.page";

// FER-027. Each test seeds its own store, article and member; the orders it
// places are deleted with the store (`customer_order.storeId` cascades, and
// from it the order's items and status history), the member with its user.
// Every phone is unique to the test: the hourly phone limit counts orders
// across all stores, and parallel workers and repeats would share one.
test.use({ storageState: { cookies: [], origins: [] } });

const ORDER_CREATE = "/api/orpc/order/create";
const CHANGE_STATUS = "/api/orpc/order/changeStatus";

/**
 * A Uruguayan mobile no other test uses, stored as `+5989…` and typed by
 * the staff in its local form (`09X XXX XXX`). `avoidCode` is another
 * order's code: a search by it also matches phones holding its digits (three
 * or more), so this phone never holds them.
 */
function uniquePhone(avoidCode?: string) {
  const avoid = avoidCode?.replaceAll(/\D/gu, "") ?? "";

  for (;;) {
    const digits = String(randomInt(10_000_000)).padStart(7, "0");
    const international = `+5989${digits}`;

    if (avoid.length < 3 || !international.includes(avoid)) {
      return {
        international,
        local: `09${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4)}`,
      };
    }
  }
}

/** A store with one published article, and a login that works on it. */
async function setup({ db }: { db: DbFixture["db"] }) {
  const store = await db.seed.createStore({ name: "Orders Store" });
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
  const login = await db.seed.createLogin({
    role: "member",
    storeIds: [store.id],
  });

  return {
    login,
    necklace,
    store,
    /** An order's status and its history, straight from the database. */
    orderState: async (code: string) => {
      const [found] = await db.drizzle
        .select({ id: customerOrder.id, status: customerOrder.status })
        .from(customerOrder)
        .where(
          and(eq(customerOrder.storeId, store.id), eq(customerOrder.code, code))
        );

      if (!found) {
        throw new Error(`Order ${code} is not in the test's store`);
      }

      const history = await db.drizzle
        .select({
          changedById: orderStatusEvent.changedById,
          status: orderStatusEvent.status,
        })
        .from(orderStatusEvent)
        .where(eq(orderStatusEvent.orderId, found.id))
        .orderBy(asc(orderStatusEvent.createdAt), asc(orderStatusEvent.id));

      return { history, id: found.id, status: found.status };
    },
  };
}

/**
 * Places an order as the storefront's checkout does, through its request:
 * for the tests whose subject is the admin, not the checkout (the first
 * test places one through the storefront's screens).
 */
async function placeOrder(
  page: Page,
  {
    customerName,
    customerPhone,
    productId,
    storeSlug,
  }: {
    customerName: string;
    customerPhone: string;
    productId: number;
    storeSlug: string;
  }
) {
  const response = await page.request.post(ORDER_CREATE, {
    data: {
      json: {
        customerName,
        customerPhone,
        items: [{ productId, quantity: 1 }],
        locale: "es",
        requestKey: crypto.randomUUID(),
        storeSlug,
      },
    },
  });

  expect(response.status()).toBe(200);
  const { json } = (await response.json()) as {
    json: { code: string; token: string };
  };

  return json;
}

/** Signs `login` in through the form, landing in the admin. */
async function signIn(page: Page, login: SeededLogin) {
  const signInPage = new AdminSignInPage(page);
  await signInPage.goto();
  await signInPage.signIn(login.email, login.password);
  const admin = new AdminPage(page);
  await admin.waitForLoad();

  return admin;
}

/**
 * Opens the store's orders screen and waits until React owns it: the sound
 * switch is enabled only once the screen read the staff's preference, after
 * it hydrated. A row tapped from here navigates on the client, so the order's
 * page arrives already owned by React.
 */
async function openOrders(admin: AdminPage, storeSlug: string, query = "") {
  await admin.goto(`/admin/${storeSlug}/orders${query}`);
  await expect(admin.heading()).toHaveText("Pedidos");
  await expect(
    admin.page.getByRole("button", { name: "Sonido cuando llega un pedido" })
  ).toBeEnabled();
}

/** A row of the list, by the order's code. */
function orderRow(page: Page, code: string) {
  return page.getByTestId(`order-row-${code}`);
}

/**
 * Taps a row of the list and waits for the order's page. An order opened
 * before stays mounted and hidden (the router keeps pages left behind), so
 * the page is the visible one.
 */
async function openOrder(page: Page, code: string) {
  await orderRow(page, code).getByRole("link").click();
  await expect(
    page.getByTestId("order-detail").filter({ visible: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: `Pedido ${code}` })
  ).toBeVisible();
}

/** Taps one of the order's moves and waits for the server to take it. */
async function move(
  page: Page,
  label: string,
  status: "delivered" | "packed" | "undeliverable"
) {
  await completeRpcAction(
    page,
    CHANGE_STATUS,
    async () => {
      await page.getByRole("button", { exact: true, name: label }).click();
    },
    { input: { status } }
  );
}

/** The order page's history, one line per status: "<status><who>…". */
function historyLines(page: Page) {
  return page.getByTestId("order-history").getByRole("listitem");
}

/** A tab of the orders screen, by its whole label with the count. */
function tab(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Filtrar por estado" })
    .getByRole("link", { exact: true, name });
}

test.describe("Order management", () => {
  test("an order placed on the storefront appears in the admin and is taken to delivered", async ({
    db,
    page,
  }) => {
    const { login, orderState, store } = await setup({ db });
    const phone = uniquePhone();
    const storePage = new StorePage(page, store.slug);

    // The shopper: the article into the cart, then the checkout.
    await page.goto(`/${store.slug}/products`);
    const add = page.getByRole("button", {
      name: "Agregar al carrito: Collar dorado",
    });
    // Enabled only once React owns it; a retried click would add twice.
    await expect(add).toBeEnabled();
    await add.click();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 1 unidad"
    );
    await storePage.getCartButton().click();
    await expect(page).toHaveURL(`/${store.slug}/cart`);
    await expect(page.getByTestId("store-checkout-submit")).toBeEnabled();
    await page.getByLabel("Tu nombre").fill("Josefina Núñez");
    await page.getByLabel("Tu celular").fill(phone.local);
    await completeRpcAction(
      page,
      ORDER_CREATE,
      async () => {
        await page.getByTestId("store-checkout-submit").click();
      },
      { input: { customerName: "Josefina Núñez", storeSlug: store.slug } }
    );
    await expect(page).toHaveURL(
      new RegExp(`/${store.slug}/orders/[A-Za-z0-9_-]{43}$`, "u")
    );
    const shopperUrl = new URL(page.url()).pathname;
    const codeOnPage = page.getByTestId("store-order-code");
    await expect(codeOnPage).toHaveText(
      /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u
    );
    const code = (await codeOnPage.textContent()) ?? "";

    // The store's member finds it in the list.
    const admin = await signIn(page, login);
    await openOrders(admin, store.slug);
    const row = orderRow(page, code);
    await expect(row).toContainText("Josefina Núñez");
    await expect(row).toContainText("$ 1.200");
    await expect(row).toContainText("Recibido");
    await expect(row).toContainText("Teléfono confirmado: No");

    // Two taps from the list: the row, then "Mark packed".
    await openOrder(page, code);
    await expect(page).toHaveURL(
      new RegExp(`/admin/${store.slug}/orders/\\d+$`, "u")
    );
    await expect(page.getByTestId("order-contact")).toContainText(
      phone.international
    );
    await move(page, "Marcar preparado", "packed");
    await expect(
      page.getByRole("button", { exact: true, name: "Marcar entregado" })
    ).toBeVisible();

    await move(page, "Marcar entregado", "delivered");
    // Delivered allows only the way back.
    await expect(
      page.getByRole("button", { exact: true, name: "Volver a preparado" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { exact: true, name: "Marcar entregado" })
    ).toHaveCount(0);

    // Each move, with who made it; placing it was the shopper.
    await expect(historyLines(page)).toHaveText([
      /^RecibidoPedido hecho/u,
      new RegExp(`^Preparado${login.name}`, "u"),
      new RegExp(`^Entregado${login.name}`, "u"),
    ]);
    const { history, status } = await orderState(code);
    expect(status).toBe("delivered");
    expect(history).toEqual([
      { changedById: null, status: "received" },
      { changedById: login.id, status: "packed" },
      { changedById: login.id, status: "delivered" },
    ]);

    // The shopper's page says so.
    await page.goto(shopperUrl);
    await expect(page.getByTestId("store-order-status")).toHaveText(
      "Entregado"
    );
  });
  test("couldn't deliver asks first: cancelling changes nothing, confirming moves it", async ({
    db,
    page,
  }) => {
    const { login, necklace, orderState, store } = await setup({ db });
    const { code } = await placeOrder(page, {
      customerName: "Ana Prueba",
      customerPhone: uniquePhone().international,
      productId: necklace.id,
      storeSlug: store.slug,
    });
    const admin = await signIn(page, login);
    await openOrders(admin, store.slug);
    await openOrder(page, code);
    await move(page, "Marcar preparado", "packed");
    const undeliverable = page.getByRole("button", {
      exact: true,
      name: "No se pudo entregar",
    });
    const dialog = page.getByTestId("confirm-dialog");

    await clickUntilVisible(undeliverable, dialog);
    await expect(dialog).toContainText("¿No se pudo entregar el pedido?");
    await expect(dialog).toContainText(
      `El pedido ${code} pasa a «No se pudo entregar»`
    );
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expectDialogRemoved(page, dialog);

    // Still packed, on screen and in the database, with nothing added.
    await expect(
      page.getByRole("button", { exact: true, name: "Marcar entregado" })
    ).toBeVisible();
    await expect(historyLines(page)).toHaveCount(2);
    expect(await orderState(code)).toMatchObject({
      history: [{ status: "received" }, { status: "packed" }],
      status: "packed",
    });

    await undeliverable.click();
    await expect(dialog).toBeVisible();
    await completeRpcAction(
      page,
      CHANGE_STATUS,
      async () => {
        await dialog
          .getByRole("button", { name: "Sí, no se pudo entregar" })
          .click();
      },
      { input: { status: "undeliverable" } }
    );
    await expectDialogRemoved(page, dialog);

    await expect(
      page.getByRole("button", { exact: true, name: "Volver a preparado" })
    ).toBeVisible();
    await expect(undeliverable).toHaveCount(0);
    await expect(historyLines(page).last()).toHaveText(
      new RegExp(`^No se pudo entregar${login.name}`, "u")
    );
    expect((await orderState(code)).status).toBe("undeliverable");
  });

  test("tabs count by status and follow a move; the search finds by code, name and phone; both live in the address", async ({
    db,
    page,
  }) => {
    const { login, necklace, store } = await setup({ db });
    const josefinaPhone = uniquePhone();
    const josefina = await placeOrder(page, {
      customerName: "Josefina Núñez",
      customerPhone: josefinaPhone.international,
      productId: necklace.id,
      storeSlug: store.slug,
    });
    // Ana's phone never holds Josefina's code: searching it finds one order.
    const ana = await placeOrder(page, {
      customerName: "Ana Prueba",
      customerPhone: uniquePhone(josefina.code).international,
      productId: necklace.id,
      storeSlug: store.slug,
    });
    const admin = await signIn(page, login);
    await openOrders(admin, store.slug);

    await expect(tab(page, "Todos (2)")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(tab(page, "Recibido (2)")).toBeVisible();
    await expect(tab(page, "Preparado (0)")).toBeVisible();
    await tab(page, "Recibido (2)").click();
    await expect(page).toHaveURL(`/admin/${store.slug}/orders?status=received`);
    await expect(tab(page, "Recibido (2)")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(orderRow(page, josefina.code)).toBeVisible();
    await expect(orderRow(page, ana.code)).toBeVisible();

    // Packing one moves it from one count to the other.
    await openOrder(page, josefina.code);
    await move(page, "Marcar preparado", "packed");
    await expect(
      page.getByRole("button", { exact: true, name: "Marcar entregado" })
    ).toBeVisible();
    // The way back returns to the tab the order was opened from.
    await page.getByRole("link", { name: "Volver a pedidos" }).click();
    await expect(page).toHaveURL(`/admin/${store.slug}/orders?status=received`);
    await expect(tab(page, "Recibido (1)")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(tab(page, "Preparado (1)")).toBeVisible();
    await expect(tab(page, "Todos (2)")).toBeVisible();
    await tab(page, "Preparado (1)").click();
    await expect(page).toHaveURL(`/admin/${store.slug}/orders?status=packed`);
    await expect(orderRow(page, josefina.code)).toBeVisible();
    await expect(orderRow(page, ana.code)).toHaveCount(0);
    await tab(page, "Todos (2)").click();
    await expect(page).toHaveURL(`/admin/${store.slug}/orders`);
    await expect(orderRow(page, ana.code)).toBeVisible();

    const search = page.getByLabel("Buscar pedidos");
    const searches = [
      ["its code", josefina.code],
      ["the name without accents", "nunez"],
      ["the phone as typed locally", josefinaPhone.local],
    ] as const;

    for (const [what, typed] of searches) {
      await test.step(`by ${what}`, async () => {
        await search.fill(typed);
        await expect(page).toHaveURL(
          (url) => url.searchParams.get("q") === typed
        );
        await expect(orderRow(page, josefina.code)).toBeVisible();
        await expect(orderRow(page, ana.code)).toHaveCount(0);
      });
    }

    // A tab keeps the search; the address alone brings both back.
    await search.fill("nunez");
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("q") === "nunez"
    );
    await tab(page, "Preparado (1)").click();
    await expect(page).toHaveURL(
      `/admin/${store.slug}/orders?status=packed&q=nunez`
    );
    await openOrders(admin, store.slug, "?status=packed&q=nunez");
    await expect(search).toHaveValue("nunez");
    await expect(tab(page, "Preparado (1)")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(orderRow(page, josefina.code)).toBeVisible();
    await expect(orderRow(page, ana.code)).toHaveCount(0);
    // The search within the status: Ana is received, not packed.
    await search.fill("prueba");
    await expect(page).toHaveURL(
      `/admin/${store.slug}/orders?status=packed&q=prueba`
    );
    await expect(page.getByTestId("empty-state")).toContainText(
      "Ningún pedido coincide con «prueba»."
    );
  });

  test("the navigation counts the orders still to pack, and shows nothing at zero", async ({
    db,
    page,
  }) => {
    const { login, necklace, store } = await setup({ db });
    const { code } = await placeOrder(page, {
      customerName: "Ana Prueba",
      customerPhone: uniquePhone().international,
      productId: necklace.id,
      storeSlug: store.slug,
    });
    const admin = await signIn(page, login);
    await openOrders(admin, store.slug);
    const ordersLink = admin
      .storeNavigation()
      .getByRole("link", { name: /^Pedidos/u });
    const badge = ordersLink.getByTestId("orders-pending-badge");

    // The figure for the eye; the link's name for a screen reader.
    await expect(badge.getByText("1", { exact: true })).toBeVisible();
    await expect(ordersLink).toHaveAccessibleName("Pedidos, 1 sin preparar");

    await openOrder(page, code);
    await move(page, "Marcar preparado", "packed");

    await expect(badge).toHaveCount(0);
    await expect(ordersLink).toHaveAccessibleName("Pedidos");
    await page.getByRole("link", { name: "Volver a pedidos" }).click();
    await expect(tab(page, "Recibido (0)")).toBeVisible();
    await expect(badge).toHaveCount(0);
  });

  test("an order placed while the staff is on another order is new on return, until opened", async ({
    db,
    page,
  }) => {
    const { login, necklace, store } = await setup({ db });
    const first = await placeOrder(page, {
      customerName: "Ana Prueba",
      customerPhone: uniquePhone().international,
      productId: necklace.id,
      storeSlug: store.slug,
    });
    const admin = await signIn(page, login);
    await openOrders(admin, store.slug, "?status=received");
    // What the screen opened with is not news.
    await expect(orderRow(page, first.code)).toBeVisible();
    await expect(
      orderRow(page, first.code).getByTestId("order-new")
    ).toHaveCount(0);

    await openOrder(page, first.code);
    await expect(page).toHaveURL(
      new RegExp(`/admin/${store.slug}/orders/\\d+\\?status=received$`, "u")
    );
    const second = await placeOrder(page, {
      customerName: "Josefina Núñez",
      customerPhone: uniquePhone(first.code).international,
      productId: necklace.id,
      storeSlug: store.slug,
    });
    await page.getByRole("link", { name: "Volver a pedidos" }).click();
    await expect(page).toHaveURL(`/admin/${store.slug}/orders?status=received`);

    await expect(
      orderRow(page, second.code).getByTestId("order-new")
    ).toHaveText("Nuevo");
    await expect(
      page.getByText(`Llegó el pedido ${second.code}`, { exact: true })
    ).toBeAttached();
    await expect(
      orderRow(page, first.code).getByTestId("order-new")
    ).toHaveCount(0);

    // Opening it is seeing it.
    await openOrder(page, second.code);
    await page.getByRole("link", { name: "Volver a pedidos" }).click();
    await expect(orderRow(page, second.code)).toBeVisible();
    await expect(
      orderRow(page, second.code).getByTestId("order-new")
    ).toHaveCount(0);
  });

  test("another store's member cannot open the order and never sees it", async ({
    db,
    page,
  }) => {
    const { necklace, orderState, store } = await setup({ db });
    const { code } = await placeOrder(page, {
      customerName: "Ana Prueba",
      customerPhone: uniquePhone().international,
      productId: necklace.id,
      storeSlug: store.slug,
    });
    const { id } = await orderState(code);
    const other = await db.seed.createStore({ name: "Other Store" });
    const outsider = await db.seed.createLogin({
      role: "member",
      storeIds: [other.id],
    });
    const admin = await signIn(page, outsider);
    const notFound = page.getByRole("heading", {
      name: "Página no encontrada",
    });

    for (const path of [
      `/admin/${store.slug}/orders/${id}`,
      `/admin/${store.slug}/orders`,
      // Its own store's address with the other store's order.
      `/admin/${other.slug}/orders/${id}`,
    ]) {
      await test.step(path, async () => {
        await page.goto(path);
        await expect(notFound).toBeVisible();
      });
    }

    await openOrders(admin, other.slug);
    await expect(page.getByTestId("empty-state")).toContainText(
      "Todavía no hay pedidos."
    );
    await expect(tab(page, "Todos (0)")).toBeVisible();
    await openOrders(admin, other.slug, `?q=${code}`);
    await expect(page.getByTestId("empty-state")).toContainText(
      `Ningún pedido coincide con «${code}».`
    );
    await expect(orderRow(page, code)).toHaveCount(0);
  });
});
