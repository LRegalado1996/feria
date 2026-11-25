import type { Page } from "@playwright/test";

import { expect, test } from "../../fixtures";
import { expectInPlace } from "../../fixtures/expect-in-place";
import { AdminPage } from "../../page-objects/admin.page";

// FER-064. Every admin page renders its own shell, and Next keeps the
// screens left behind mounted and hidden (Cache Components): however the
// person got to a screen, the document holds one element with its main
// landmark's id, assistive technology finds one main, and the skip link
// lands on the screen on show. The default `page` is the worker's login.

const SIZES = [
  ["a phone", { height: 812, width: 375 }],
  ["a computer", { height: 900, width: 1440 }],
] as const;

/**
 * The screen on show has the one main landmark, holding its heading; its id
 * is on no other element, the hidden screens' landmarks have ids of their
 * own, and the skip link targets it.
 */
async function expectOneMain(admin: AdminPage, heading: string) {
  const main = admin.main();
  await expect(main).toHaveCount(1);
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(heading);
  const id = await main.getAttribute("id");
  expect(id).toBeTruthy();
  expect(await admin.countId(id ?? "")).toBe(1);
  const ids = await admin
    .everyMain()
    .evaluateAll((mains) => mains.map((element) => element.id));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(admin.skipLink()).toHaveAttribute("href", `#${id}`);
}

/** The skip link, once focused, moves focus into the screen on show. */
async function expectSkipToScreen(page: Page, admin: AdminPage) {
  await admin.skipLink().focus();
  await expect(admin.skipLink()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(admin.main()).toBeFocused();
}

for (const [size, viewport] of SIZES) {
  test.describe(`The admin's main landmark on ${size}`, () => {
    test.use({ viewport });

    test("after navigating between three screens and back, one main landmark the skip link reaches", async ({
      page,
    }) => {
      const admin = new AdminPage(page);
      const phone = viewport.width < 768;

      /**
       * Opens a section from the navigation, as a person does, in place:
       * the phone's menu once closed under its link before the link could
       * navigate, and the whole document loaded again.
       */
      const open = async (label: string) => {
        if (phone) {
          await admin.openMenu();
        }
        await expectInPlace(page, async () => {
          await admin.sectionLink(label).click();
          await expect(admin.heading()).toHaveText(label);
        });
      };

      await admin.goto("/admin/orders");
      await expectOneMain(admin, "Pedidos");
      // On the first load the page's first Tab reaches the skip link.
      await page.keyboard.press("Tab");
      await expect(admin.skipLink()).toBeFocused();
      await expectSkipToScreen(page, admin);

      // React must own the links before they navigate in place: a click
      // that lands first loads a whole new document, which keeps nothing.
      // On a phone the menu opens only once it does.
      if (!phone) {
        await expect(
          admin.getButton("Cerrar sesión").filter({ visible: true })
        ).toBeEnabled();
      }

      await open("Artículos");
      await expectOneMain(admin, "Artículos");
      await expectSkipToScreen(page, admin);

      await open("Categorías");
      await expectOneMain(admin, "Categorías");
      await expectSkipToScreen(page, admin);

      // The screens left behind are still in the document, hidden: what
      // made the ids clash.
      await expect
        .poll(async () => await admin.everyMain().count())
        .toBeGreaterThan(1);

      // And back, with the browser's Back: the skip link leaves no jump in
      // the history to undo, and Next shows the kept screens again.
      await page.goBack();
      await expect(admin.heading()).toHaveText("Artículos");
      await expectOneMain(admin, "Artículos");
      await expectSkipToScreen(page, admin);

      await page.goBack();
      await expect(admin.heading()).toHaveText("Pedidos");
      await expectOneMain(admin, "Pedidos");
      await expectSkipToScreen(page, admin);
    });
  });
}
