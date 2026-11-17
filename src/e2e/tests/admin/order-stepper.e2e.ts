import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";

import { customerOrder } from "../../../server/db/schema";
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

// FER-051. An order's status as a row of steps: the admin moves it from the
// stepper after confirming, and the shopper's page shows the same picture,
// read only. Each test places an order of its own, on an article of its
// own, from a phone of its own, and opens it by searching that phone.
test.use({ storageState: { cookies: [], origins: [] } });

const CHANGE_STATUS = "/api/orpc/order/changeStatus";

/** A login and an order on an article of the test's own. */
async function setup({ db, page }: { db: DbFixture["db"]; page: Page }) {
  const tag = uniqueTag();
  const category = await db.seed.createCategory({
    nameEs: `Pasos ${tag}`,
    slug: `pasos-${tag}`,
  });
  const article = await db.seed.createArticle({
    categoryId: category.id,
    priceAmount: 90_000,
    title: "Anillo de prueba",
  });
  const login = await db.seed.createLogin();
  const phone = uniquePhone();
  const order = await placeOrder(page.request, {
    customerName: "Lía Pasos",
    customerPhone: phone.international,
    productId: article.id,
  });

  return {
    login,
    order,
    phone,
    /** The order's status, straight from the database. */
    status: async () => {
      const [found] = await db.drizzle
        .select({ status: customerOrder.status })
        .from(customerOrder)
        .where(
          and(
            eq(customerOrder.storeId, db.storeId),
            eq(customerOrder.code, order.code)
          )
        );

      return found?.status ?? null;
    },
  };
}

/** Signs in and opens the order from the list, searched by its phone. */
async function openOrder(
  page: Page,
  login: SeededLogin,
  { code, national }: { code: string; national: string }
) {
  const signInPage = new AdminSignInPage(page);
  await signInPage.goto();
  await signInPage.signIn(login.email, login.password);
  const orders = new AdminOrdersPage(page);
  await orders.waitForLoad();
  await orders.open(`?q=${national}`);
  await orders.openOrder(code);

  return orders;
}

/** The stepper on screen: the computer's or the phone's. */
function stepper(page: Page) {
  return page.getByTestId("order-stepper").filter({ visible: true });
}

test.describe("The order stepper", () => {
  test("moves an order only once confirmed, cancelling changes nothing, and the shopper's page follows", async ({
    db,
    page,
  }) => {
    const { login, order, phone, status } = await setup({ db, page });
    await openOrder(page, login, {
      code: order.code,
      national: phone.national,
    });
    const steps = stepper(page);
    const dialog = page.getByTestId("confirm-dialog");

    await expect(steps).toHaveCount(1);
    await expect(
      steps.getByRole("list", { name: "Estado del pedido: Recibido" })
    ).toBeVisible();
    await expect(
      page.getByTestId("order-step-received").filter({ visible: true })
    ).toHaveAttribute("aria-current", "step");
    // Only what the order domain allows: from received, to packed.
    await expect(
      steps.getByRole("button", {
        exact: true,
        name: "Entregado: antes tiene que pasar por Preparado",
      })
    ).toHaveAttribute("aria-disabled", "true");

    // Asked first; cancelled, nothing moves.
    const toPacked = steps.getByRole("button", {
      exact: true,
      name: "Pasar a Preparado",
    });
    await clickUntilVisible(toPacked, dialog);
    await expect(dialog).toContainText("¿Pasar el pedido a Preparado?");
    await expect(dialog).toContainText(
      `El pedido ${order.code} pasa a «Preparado»`
    );
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expectDialogRemoved(page, dialog);
    await expect(toPacked).toBeFocused();
    expect(await status()).toBe("received");

    // Confirmed, it moves.
    await toPacked.click();
    await completeRpcAction(
      page,
      CHANGE_STATUS,
      async () => {
        await dialog
          .getByRole("button", { name: "Sí, pasar a Preparado" })
          .click();
      },
      { input: { status: "packed" } }
    );
    await expectDialogRemoved(page, dialog);
    await expect(
      steps.getByRole("list", { name: "Estado del pedido: Preparado" })
    ).toBeVisible();
    expect(await status()).toBe("packed");

    // The detour, from the stepper too.
    await steps
      .getByRole("button", { exact: true, name: "Pasar a No se pudo entregar" })
      .click();
    await expect(dialog).toContainText("¿No se pudo entregar el pedido?");
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
      steps.getByRole("list", {
        name: "Estado del pedido: No se pudo entregar",
      })
    ).toBeVisible();
    await expect(
      page.getByTestId("order-step-undeliverable").filter({ visible: true })
    ).toHaveAttribute("aria-current", "step");
    expect(await status()).toBe("undeliverable");

    // The shopper's page shows the same, read only.
    await page.goto(`/orders/${order.token}`);
    const shopperSteps = stepper(page);
    await expect(
      shopperSteps.getByRole("list", {
        name: "Estado del pedido: No se pudo entregar",
      })
    ).toBeVisible();
    await expect(shopperSteps.getByRole("button")).toHaveCount(0);
    await expect(
      page.getByTestId("order-step-undeliverable").filter({ visible: true })
    ).toHaveAttribute("aria-current", "step");

    // Its way back to the store centered, then the festive band. The row
    // under it draws its category from the cached catalog, which seeding
    // straight into the database leaves stale: the page's tests hold it.
    const box = await page
      .getByRole("link", { name: "Seguir mirando la tienda" })
      .boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(
      Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - width / 2)
    ).toBeLessThan(2);
    await expect(
      page.getByTestId("store-article-band").filter({ visible: true })
    ).toContainText("¡Felices Fiestas!");
  });

  test("copies the shopper's link, whole, and says so", async ({
    context,
    db,
    page,
    baseURL,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const { login, order, phone } = await setup({ db, page });
    await openOrder(page, login, {
      code: order.code,
      national: phone.national,
    });
    const contact = page.getByTestId("order-contact").filter({ visible: true });

    await contact
      .getByRole("button", { name: "Copiar el enlace del pedido" })
      .click();

    await expect(contact.getByRole("status")).toHaveText(
      "Copiamos el enlace del pedido."
    );
    const copied = await page.evaluate(
      async () => await navigator.clipboard.readText()
    );
    // Placed in Spanish: the page without a language prefix.
    expect(copied).toBe(
      new URL(`/orders/${order.token}`, baseURL ?? page.url()).href
    );
  });
});

test.describe("The order stepper on a phone", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("runs down the page, at its end, in the admin and on the shopper's page", async ({
    db,
    page,
  }) => {
    const { login, order, phone } = await setup({ db, page });
    await openOrder(page, login, {
      code: order.code,
      national: phone.national,
    });

    await expect(page.getByTestId("order-stepper-wide")).toBeHidden();
    const narrow = page.getByTestId("order-stepper-narrow");
    await expect(narrow).toBeVisible();
    const [first, last] = await Promise.all([
      narrow.getByTestId("order-step-received").boundingBox(),
      narrow.getByTestId("order-step-delivered").boundingBox(),
    ]);
    // Down: the last step sits under the first.
    expect(last?.y ?? 0).toBeGreaterThan((first?.y ?? 0) + 40);
    expect(Math.abs((last?.x ?? 0) - (first?.x ?? 0))).toBeLessThan(2);

    await page.goto(`/orders/${order.token}`);
    const shopper = stepper(page);
    await expect(shopper).toHaveCount(1);
    // At the end of the order, above its buttons.
    const [steps, actions] = await Promise.all([
      shopper.boundingBox(),
      page.getByTestId("store-order-actions").boundingBox(),
    ]);
    expect(steps?.y ?? 0).toBeLessThan(actions?.y ?? 0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
});
