import type { Page } from "@playwright/test";
import { count, eq } from "drizzle-orm";

import { customerOrder } from "../../../server/db/schema";
import {
  type DbFixture,
  expect,
  type SeededLogin,
  test,
  uniquePhone,
  uniqueTag,
} from "../../fixtures";
import { placeOrder } from "../../fixtures/place-order";
import { AdminOrdersPage } from "../../page-objects/admin-orders.page";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";

// FER-027. The tabs and the navigation's badge count every order of the
// store, which every spec shares (FER-038): another spec's order would move
// the counts. So these run alone, in the serial project, before the parallel
// one, on a store that holds no orders but theirs.
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * A published article in a category of the test's own and a login, on a
 * store with no orders yet: the counts below are of this test's orders only.
 */
async function setup({ db }: { db: DbFixture["db"] }) {
  const [orders] = await db.drizzle
    .select({ total: count() })
    .from(customerOrder)
    .where(eq(customerOrder.storeId, db.storeId));
  expect(
    orders?.total,
    "the serial project counts its own orders: run it on a store with none, as pnpm e2e:ci does"
  ).toBe(0);
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

  return { login: await db.seed.createLogin(), necklace };
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

test.describe("Order counts", () => {
  test("tabs count by status and follow a move; the search finds by code, name and phone; both live in the address", async ({
    db,
    page,
  }) => {
    const { login, necklace } = await setup({ db });
    const josefinaPhone = uniquePhone();
    const josefina = await placeOrder(page.request, {
      customerName: "Josefina Núñez",
      customerPhone: josefinaPhone.international,
      productId: necklace.id,
    });
    const ana = await placeOrder(page.request, {
      customerName: "Ana Prueba",
      customerPhone: uniquePhone().international,
      productId: necklace.id,
    });
    const orders = await signIn(page, login);
    await orders.open();

    await expect(orders.tab("Todos (2)")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(orders.tab("Recibido (2)")).toBeVisible();
    await expect(orders.tab("Preparado (0)")).toBeVisible();
    await orders.tab("Recibido (2)").click();
    await expect(page).toHaveURL("/admin/orders?status=received");
    await expect(orders.tab("Recibido (2)")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(orders.row(josefina.code)).toBeVisible();
    await expect(orders.row(ana.code)).toBeVisible();

    // Packing one moves it from one count to the other.
    await orders.openOrder(josefina.code);
    await orders.move("Marcar preparado", "packed");
    await expect(orders.getButton("Marcar entregado")).toBeVisible();
    // The way back returns to the tab the order was opened from.
    await orders.backToList().click();
    await expect(page).toHaveURL("/admin/orders?status=received");
    await expect(orders.tab("Recibido (1)")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(orders.tab("Preparado (1)")).toBeVisible();
    await expect(orders.tab("Todos (2)")).toBeVisible();
    await orders.tab("Preparado (1)").click();
    await expect(page).toHaveURL("/admin/orders?status=packed");
    await expect(orders.row(josefina.code)).toBeVisible();
    await expect(orders.row(ana.code)).toHaveCount(0);
    await orders.tab("Todos (2)").click();
    await expect(page).toHaveURL("/admin/orders");
    await expect(orders.row(ana.code)).toBeVisible();

    const search = orders.search();
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
        await expect(orders.row(josefina.code)).toBeVisible();
        await expect(orders.row(ana.code)).toHaveCount(0);
      });
    }

    // A tab keeps the search; the address alone brings both back.
    await search.fill("nunez");
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("q") === "nunez"
    );
    await orders.tab("Preparado (1)").click();
    await expect(page).toHaveURL("/admin/orders?status=packed&q=nunez");
    await orders.open("?status=packed&q=nunez");
    await expect(search).toHaveValue("nunez");
    await expect(orders.tab("Preparado (1)")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(orders.row(josefina.code)).toBeVisible();
    await expect(orders.row(ana.code)).toHaveCount(0);
    // The search within the status: Ana is received, not packed.
    await search.fill("prueba");
    await expect(page).toHaveURL("/admin/orders?status=packed&q=prueba");
    await expect(page.getByTestId("empty-state")).toContainText(
      "Ningún pedido coincide con «prueba»."
    );
  });

  test("the navigation counts the orders still to pack, and shows nothing at zero", async ({
    db,
    page,
  }) => {
    const { login, necklace } = await setup({ db });
    const { code } = await placeOrder(page.request, {
      customerName: "Ana Prueba",
      customerPhone: uniquePhone().international,
      productId: necklace.id,
    });
    const orders = await signIn(page, login);
    await orders.open();
    const ordersLink = orders.sectionLink("Pedidos");
    const badge = ordersLink.getByTestId("orders-pending-badge");

    // The figure for the eye; the link's name for a screen reader.
    await expect(badge.getByText("1", { exact: true })).toBeVisible();
    await expect(ordersLink).toHaveAccessibleName("Pedidos, 1 sin preparar");

    await orders.openOrder(code);
    await orders.move("Marcar preparado", "packed");

    await expect(badge).toHaveCount(0);
    await expect(ordersLink).toHaveAccessibleName("Pedidos");
    await orders.backToList().click();
    await expect(orders.tab("Recibido (0)")).toBeVisible();
    await expect(badge).toHaveCount(0);
  });
});
