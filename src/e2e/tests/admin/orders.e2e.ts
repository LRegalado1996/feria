import type { Page } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";

import { customerOrder, orderStatusEvent } from "../../../server/db/schema";
import {
  type DbFixture,
  expect,
  type SeededLogin,
  test,
  uniquePhone,
  uniqueTag,
} from "../../fixtures";
import { clickUntilVisible } from "../../fixtures/click-until-visible";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { placeOrder } from "../../fixtures/place-order";
import { AdminOrdersPage } from "../../page-objects/admin-orders.page";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { StorePage } from "../../page-objects/store.page";

// FER-027. Each test seeds an article and a login of its own, and finds its
// orders by their codes or their phone: the store's orders are every spec's
// (FER-038), so the list is opened searched by the test's phone, never on
// its first page, which other specs' orders can fill. The db fixture deletes
// the orders holding the test's article. The tabs' counts and the
// navigation's count of orders to pack read every order, so they are
// `orders.serial.e2e.ts`.
test.use({ storageState: { cookies: [], origins: [] } });

const ORDER_CREATE = "/api/orpc/order/create";

/** A published article in a category of the test's own, and a login. */
async function setup({ db }: { db: DbFixture["db"] }) {
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
  const login = await db.seed.createLogin();

  return {
    jewels,
    login,
    necklace,
    /** An order's status and its history, straight from the database. */
    orderState: async (code: string) => {
      const [found] = await db.drizzle
        .select({ id: customerOrder.id, status: customerOrder.status })
        .from(customerOrder)
        .where(
          and(
            eq(customerOrder.storeId, db.storeId),
            eq(customerOrder.code, code)
          )
        );

      if (!found) {
        throw new Error(`Order ${code} is not in the store`);
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

/** Signs `login` in through the form, landing in the admin. */
async function signIn(page: Page, login: SeededLogin) {
  const signInPage = new AdminSignInPage(page);
  await signInPage.goto();
  await signInPage.signIn(login.email, login.password);
  const orders = new AdminOrdersPage(page);
  await orders.waitForLoad();

  return orders;
}

/** The address's search and status, in the order the screen writes them. */
function selection(url: string) {
  const { pathname, searchParams } = new URL(url);

  return { pathname, query: [...searchParams.entries()] };
}

test.describe("Order management", () => {
  test("an order placed on the storefront appears in the admin and is taken to delivered", async ({
    db,
    page,
  }) => {
    const { login, necklace, orderState } = await setup({ db });
    const phone = uniquePhone();
    const storePage = new StorePage(page);

    // The shopper: the article into the cart from its page, then the
    // checkout.
    await page.goto(`/productos/${necklace.slug}`);
    const add = page.getByRole("button", {
      exact: true,
      name: "Agregar al carrito",
    });
    // Enabled only once React owns it; a retried click would add twice.
    await expect(add).toBeEnabled();
    await add.click();
    await expect(storePage.getCartButton()).toHaveAccessibleName(
      "Carrito, 1 unidad"
    );
    await storePage.getCartButton().click();
    await expect(page).toHaveURL("/cart");
    await expect(page.getByTestId("store-checkout-submit")).toBeEnabled();
    await page.getByLabel("Tu nombre").fill("Josefina Núñez");
    await page.getByLabel("Tu celular").fill(phone.local);
    await completeRpcAction(
      page,
      ORDER_CREATE,
      async () => {
        await page.getByTestId("store-checkout-submit").click();
      },
      {
        input: { customerName: "Josefina Núñez", customerPhone: phone.local },
      }
    );
    await expect(page).toHaveURL(/\/orders\/[A-Za-z0-9_-]{43}$/u);
    const shopperUrl = new URL(page.url()).pathname;
    const codeOnPage = page.getByTestId("store-order-code");
    await expect(codeOnPage).toHaveText(
      /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/u
    );
    const code = (await codeOnPage.textContent()) ?? "";

    // The staff finds it in the list, searched by the shopper's phone.
    const orders = await signIn(page, login);
    await orders.open(`?q=${phone.national}`);
    const row = orders.row(code);
    await expect(row).toContainText("Josefina Núñez");
    await expect(row).toContainText("$ 1.200");
    await expect(row).toContainText("Recibido");
    await expect(row).toContainText("Teléfono confirmado: No");

    // Two taps from the list: the row, then "Mark packed". The order's page
    // keeps the list's search for the way back.
    await orders.openOrder(code);
    await expect(page).toHaveURL(
      new RegExp(`/admin/orders/\\d+\\?q=${phone.national}$`, "u")
    );
    await expect(page.getByTestId("order-contact")).toContainText(
      phone.international
    );
    await orders.move("Marcar preparado", "packed");
    await expect(orders.getButton("Marcar entregado")).toBeVisible();

    await orders.move("Marcar entregado", "delivered");
    // Delivered allows only the way back.
    await expect(orders.getButton("Volver a preparado")).toBeVisible();
    await expect(orders.getButton("Marcar entregado")).toHaveCount(0);

    // Each move, with who made it; placing it was the shopper.
    await expect(orders.historyLines()).toHaveText([
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
    const { login, necklace, orderState } = await setup({ db });
    const phone = uniquePhone();
    const { code } = await placeOrder(page.request, {
      customerName: "Ana Prueba",
      customerPhone: phone.international,
      productId: necklace.id,
    });
    const orders = await signIn(page, login);
    await orders.open(`?q=${phone.national}`);
    await orders.openOrder(code);
    await orders.move("Marcar preparado", "packed");
    const undeliverable = orders.getButton("No se pudo entregar");
    const dialog = page.getByTestId("confirm-dialog");

    await clickUntilVisible(undeliverable, dialog);
    await expect(dialog).toContainText("¿No se pudo entregar el pedido?");
    await expect(dialog).toContainText(
      `El pedido ${code} pasa a «No se pudo entregar»`
    );
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expectDialogRemoved(page, dialog);

    // Still packed, on screen and in the database, with nothing added.
    await expect(orders.getButton("Marcar entregado")).toBeVisible();
    await expect(orders.historyLines()).toHaveCount(2);
    expect(await orderState(code)).toMatchObject({
      history: [{ status: "received" }, { status: "packed" }],
      status: "packed",
    });

    await undeliverable.click();
    await expect(dialog).toBeVisible();
    await completeRpcAction(
      page,
      "/api/orpc/order/changeStatus",
      async () => {
        await dialog
          .getByRole("button", { name: "Sí, no se pudo entregar" })
          .click();
      },
      { input: { status: "undeliverable" } }
    );
    await expectDialogRemoved(page, dialog);

    await expect(orders.getButton("Volver a preparado")).toBeVisible();
    await expect(undeliverable).toHaveCount(0);
    await expect(orders.historyLines().last()).toHaveText(
      new RegExp(`^No se pudo entregar${login.name}`, "u")
    );
    expect((await orderState(code)).status).toBe("undeliverable");
  });

  test("an order placed while the staff is on another order is new on return, until opened", async ({
    db,
    page,
  }) => {
    const { login, necklace } = await setup({ db });
    // Both orders from one phone of the test's own, and the list searched by
    // it: an order another spec places meanwhile would arrive too.
    const phone = uniquePhone();
    const search = `?status=received&q=${phone.national}`;
    const first = await placeOrder(page.request, {
      customerName: "Ana Prueba",
      customerPhone: phone.international,
      productId: necklace.id,
    });
    const orders = await signIn(page, login);
    await orders.open(search);
    // What the screen opened with is not news.
    await expect(orders.row(first.code)).toBeVisible();
    await expect(orders.row(first.code).getByTestId("order-new")).toHaveCount(
      0
    );

    await orders.openOrder(first.code);
    expect(selection(page.url())).toEqual({
      pathname: expect.stringMatching(/^\/admin\/orders\/\d+$/u),
      query: [
        ["status", "received"],
        ["q", phone.national],
      ],
    });
    const second = await placeOrder(page.request, {
      customerName: "Josefina Núñez",
      customerPhone: phone.international,
      productId: necklace.id,
    });
    await orders.backToList().click();
    await expect(page).toHaveURL(`/admin/orders${search}`);

    await expect(orders.row(second.code).getByTestId("order-new")).toHaveText(
      "Nuevo"
    );
    await expect(
      page.getByText(`Llegó el pedido ${second.code}`, { exact: true })
    ).toBeAttached();
    await expect(orders.row(first.code).getByTestId("order-new")).toHaveCount(
      0
    );

    // Opening it is seeing it.
    await orders.openOrder(second.code);
    await orders.backToList().click();
    await expect(orders.row(second.code)).toBeVisible();
    await expect(orders.row(second.code).getByTestId("order-new")).toHaveCount(
      0
    );
  });

  test("an anonymous visit to an order's page ends at sign-in and comes back to the order", async ({
    db,
    page,
  }) => {
    const { login, necklace, orderState } = await setup({ db });
    const { code } = await placeOrder(page.request, {
      customerName: "Ana Prueba",
      customerPhone: uniquePhone().international,
      productId: necklace.id,
    });
    const { id } = await orderState(code);
    const signInPage = new AdminSignInPage(page);

    await page.goto(`/admin/orders/${id}`);
    await signInPage.waitForLoad();
    expect(new URL(page.url()).searchParams.get("next")).toBe(
      `/admin/orders/${id}`
    );

    await signInPage.signIn(login.email, login.password);

    await expect(
      page.getByRole("heading", { level: 1, name: `Pedido ${code}` })
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/admin/orders/${id}`);
  });

  test("an order the store does not have, or an address no order can have, is the not-found page", async ({
    db,
    page,
  }) => {
    const { login } = await setup({ db });
    await signIn(page, login);
    const notFound = page.getByRole("heading", {
      name: "Página no encontrada",
    });

    // The largest id a row can have, which no order of a test run reaches;
    // then addresses that are no id at all.
    for (const id of ["2147483647", "0", "abc"]) {
      await test.step(id, async () => {
        await page.goto(`/admin/orders/${id}`);

        await expect(notFound).toBeVisible();
        await expect(page.getByTestId("order-detail")).toHaveCount(0);
      });
    }
  });
});
