import type { Page } from "@playwright/test";

import {
  type DbFixture,
  expect,
  test,
  uniquePhone,
  uniqueTag,
} from "../../fixtures";
import { expectDialogRemoved } from "../../fixtures/expect-dialog-removed";
import { placeOrder } from "../../fixtures/place-order";
import { AdminOrdersPage } from "../../page-objects/admin-orders.page";
import { AdminPage } from "../../page-objects/admin.page";

// FER-040. The admin at a phone's width, one hand on the phone: the
// sections behind a menu button in the sticky top bar, every control a
// 44 px target, a screen's main action under the thumb, nothing scrolling
// sideways. The default `page` is the worker's own login (FER-038: every
// login is an admin); the order is placed on an article of the test's own.
test.use({ viewport: { height: 812, width: 375 } });

const PHONE = { height: 812, width: 375 };

/** An order of the test's own, placed as the checkout places one. */
async function placeOwnOrder(page: Page, db: DbFixture["db"]) {
  const tag = uniqueTag();
  const category = await db.seed.createCategory({
    nameEs: `Joyas ${tag}`,
    slug: `joyas-${tag}`,
  });
  const article = await db.seed.createArticle({
    categoryId: category.id,
    priceAmount: 120_000,
    title: "Collar dorado",
  });

  return await placeOrder(page.request, {
    customerName: "Ana Prueba",
    customerPhone: uniquePhone().international,
    productId: article.id,
  });
}

/**
 * What a thumb can tap on screen that is smaller than 44 × 44 px, as a
 * short description of each. Text kept for screen readers only (1 px) and
 * what is hidden or behind an open dialog are not on screen for a thumb.
 */
async function smallTargets(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const MIN = 44;

    return [
      ...document.querySelectorAll(
        "a[href], button, input:not([type='hidden']), select, textarea, [role='menuitemradio']"
      ),
    ]
      .filter((element) => {
        const box = element.getBoundingClientRect();

        if (box.width <= 1 || box.height <= 1) {
          return false;
        }

        if (element.closest("[aria-hidden='true']")) {
          return false;
        }

        return box.width < MIN || box.height < MIN;
      })
      .map(
        (element) =>
          `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim() || (element.getAttribute("aria-label") ?? "")}" ${Math.round(element.getBoundingClientRect().width)}×${Math.round(element.getBoundingClientRect().height)}`
      );
  });
}

/**
 * Nothing on screen is too small for a thumb. Polled: a menu or a panel
 * that just opened is still growing from 95 % or sliding in, and its box is
 * measured once it settles.
 */
async function expectNoSmallTargets(page: Page): Promise<void> {
  await expect.poll(async () => await smallTargets(page)).toEqual([]);
}

/** Where the bottom of an element is, from the top of the window. */
async function bottomOf(page: Page, testId: string): Promise<number> {
  return await page
    .getByTestId(testId)
    .filter({ visible: true })
    .evaluate((element) => element.getBoundingClientRect().bottom);
}

test.describe("Admin on a phone", () => {
  test("the menu button opens the sections over the page, keeps focus inside, closes on Escape and gives focus back", async ({
    page,
  }) => {
    const admin = new AdminPage(page);
    await admin.goto("/admin/orders");
    // The sidebar is behind the button.
    await expect(admin.navigation()).toHaveCount(0);
    await expect(admin.menuButton()).toHaveAttribute("aria-expanded", "false");

    await admin.openMenu();

    const menu = admin.menu();
    await expect(menu.getByRole("img", { name: "LR Market" })).toBeVisible();
    await expect(admin.sectionLink("Pedidos")).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(
      menu.getByRole("button", { name: "Cerrar el menú" })
    ).toBeFocused();
    // Every control of the panel, then round again: focus never leaves it.
    for (const key of [
      ...Array.from({ length: 16 }, () => "Tab"),
      "Shift+Tab",
    ]) {
      await page.keyboard.press(key);
      expect(
        await menu.evaluate((panel) => panel.contains(document.activeElement))
      ).toBe(true);
    }

    await page.keyboard.press("Escape");

    await expectDialogRemoved(page, menu);
    await expect(admin.menuButton()).toBeFocused();
    await expect(admin.menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("the dimmed area and the close button close it, focus back on the menu button", async ({
    page,
  }) => {
    const admin = new AdminPage(page);
    await admin.goto("/admin/filters");

    await admin.openMenu();
    // To the right of the panel: the page, dimmed.
    await page.mouse.click(PHONE.width - 20, PHONE.height / 2);

    await expectDialogRemoved(page, admin.menu());
    await expect(admin.menuButton()).toBeFocused();

    await admin.menuButton().click();
    await admin.menu().getByRole("button", { name: "Cerrar el menú" }).click();

    await expectDialogRemoved(page, admin.menu());
    await expect(admin.menuButton()).toBeFocused();
  });

  test("choosing a section closes the panel and opens it", async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto("/admin/orders");

    await admin.openMenu();
    await admin.sectionLink("Filtros").click();

    await expect(admin.heading()).toHaveText("Filtros");
    await expectDialogRemoved(page, admin.menu());
    expect(new URL(page.url()).pathname).toBe("/admin/filters");
  });

  test("every control of every screen is a 44 px target, and nothing scrolls sideways", async ({
    db,
    page,
  }) => {
    const { code } = await placeOwnOrder(page, db);
    const orders = new AdminOrdersPage(page);

    await test.step("the orders and an order", async () => {
      await orders.open(`?q=${code}`);
      await expect(orders.row(code)).toBeVisible();
      await expectNoSmallTargets(page);
      await orders.expectNoHorizontalScroll();

      await orders.openOrder(code);
      await expectNoSmallTargets(page);
      await orders.expectNoHorizontalScroll();
    });

    for (const [path, heading] of [
      ["/admin/categories", "Categorías"],
      ["/admin/filters", "Filtros"],
      ["/admin/settings", "Ajustes"],
    ] as const) {
      await test.step(path, async () => {
        await orders.goto(path);
        await expect(orders.heading()).toHaveText(heading);
        await expectNoSmallTargets(page);
        await orders.expectNoHorizontalScroll();
      });
    }

    await test.step("the menu and its theme choices", async () => {
      await orders.openMenu();
      await expectNoSmallTargets(page);

      const light = page.getByRole("menuitemradio", { name: "Claro" });
      await orders.menu().getByTestId("theme-toggle").click();
      await expect(light).toBeVisible();
      await expectNoSmallTargets(page);
    });
  });

  test("an order's next move stays under the thumb, wherever the page is scrolled", async ({
    db,
    page,
  }) => {
    const { code } = await placeOwnOrder(page, db);
    const orders = new AdminOrdersPage(page);
    await orders.open(`?q=${code}`);
    await orders.openOrder(code);

    // A bar along the bottom of the screen, before and after scrolling.
    expect(await bottomOf(page, "admin-primary-action")).toBe(PHONE.height);
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await expect
      .poll(async () => await page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    expect(await bottomOf(page, "admin-primary-action")).toBe(PHONE.height);
    // The page ends above the bar: its last card is not hidden behind it.
    const barTop = await page
      .getByTestId("admin-primary-action")
      .filter({ visible: true })
      .evaluate((bar) => bar.getBoundingClientRect().top);
    expect(await bottomOf(page, "order-history")).toBeLessThan(barTop);

    await orders.move("Marcar preparado", "packed");

    await expect(orders.getButton("Marcar entregado")).toBeVisible();
    expect(await bottomOf(page, "admin-primary-action")).toBe(PHONE.height);
  });

  test("a list's main action is under the thumb and takes the hand to its form", async ({
    page,
  }) => {
    const admin = new AdminPage(page);
    await admin.goto("/admin/categories");
    const add = page.getByRole("button", { name: "Nueva categoría" });
    const field = page.getByLabel("Nombre en español");
    // From the end of the list, where the form is out of sight.
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
    });

    expect(await bottomOf(page, "admin-primary-action")).toBe(PHONE.height);
    // Harmless to repeat: a tap before React owns the button does nothing,
    // so it is tapped again until the field has focus.
    await expect(async () => {
      await add.click();
      await expect(field).toBeFocused({ timeout: 1000 });
    }).toPass();

    await expect(field).toBeInViewport();
  });
});
