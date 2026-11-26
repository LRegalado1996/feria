import type { Page } from "@playwright/test";

import { type SeededLogin, expect, test } from "../../fixtures";
import { completeRpcAction } from "../../fixtures/complete-rpc-action";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";
import { StorePage } from "../../page-objects/store.page";

// FER-013, FER-038. Each test starts signed out and signs in as a login it
// seeds: every login is an admin and reaches every section.
test.use({ storageState: { cookies: [], origins: [] } });

/** The admin's sections in the navigation's order, with each one's heading. */
const SECTIONS = [
  ["orders", "Pedidos"],
  ["products", "Artículos"],
  ["categories", "Categorías"],
  ["filters", "Filtros"],
  ["pages", "Páginas"],
  ["settings", "Ajustes"],
  ["users", "Usuarios"],
  ["metrics", "Métricas"],
] as const;

/** Signs `login` in through the form, landing in the admin. */
async function signIn(page: Page, login: SeededLogin) {
  const signInPage = new AdminSignInPage(page);
  await signInPage.goto();
  await signInPage.signIn(login.email, login.password);
  const admin = new AdminPage(page);
  await admin.waitForLoad();

  return admin;
}

test.describe("Admin sign-in and landing", () => {
  for (const [section, heading] of SECTIONS) {
    test(`an anonymous visit to /admin/${section} ends at sign-in and comes back to it`, async ({
      db,
      page,
    }) => {
      const login = await db.seed.createLogin();
      const signInPage = new AdminSignInPage(page);

      await page.goto(`/admin/${section}`);
      await signInPage.waitForLoad();
      expect(new URL(page.url()).searchParams.get("next")).toBe(
        `/admin/${section}`
      );

      await signInPage.signIn(login.email, login.password);

      const admin = new AdminPage(page);
      await admin.waitForLoad();
      await expect(admin.heading()).toHaveText(heading);
      expect(new URL(page.url()).pathname).toBe(`/admin/${section}`);
    });
  }

  test("an anonymous visit to an English admin page ends at the English sign-in and comes back to it", async ({
    db,
    page,
  }) => {
    const login = await db.seed.createLogin();
    const signInPage = new AdminSignInPage(page);

    await page.goto("/en/admin/filters");
    await signInPage.waitForLoad();
    const url = new URL(page.url());
    expect(url.pathname).toBe("/en/admin/sign-in");
    expect(url.searchParams.get("next")).toBe("/en/admin/filters");
    await signInPage.expectDocumentLanguage("en");
    // The submit button is enabled only once React owns the form.
    await expect(signInPage.getButton("Sign In")).toBeEnabled();
    await signInPage.fillField("Email", login.email);
    await signInPage.fillField("Password", login.password);

    await completeRpcAction(
      page,
      "/api/auth/sign-in/email",
      async () => {
        await signInPage.getButton("Sign In").click();
      },
      { input: { email: login.email } }
    );

    const admin = new AdminPage(page);
    await admin.waitForLoad();
    await expect(admin.heading()).toHaveText("Filters");
    expect(new URL(page.url()).pathname).toBe("/en/admin/filters");
  });

  test("/admin opens the orders, in the language of the address", async ({
    db,
    page,
  }) => {
    const admin = await signIn(page, await db.seed.createLogin());

    await admin.goto("/admin");

    await expect(admin.heading()).toHaveText("Pedidos");
    expect(new URL(page.url()).pathname).toBe("/admin/orders");
    await expect(admin.sectionLink("Pedidos")).toHaveAttribute(
      "aria-current",
      "page"
    );

    await admin.goto("/en/admin");

    await expect(admin.heading()).toHaveText("Orders");
    expect(new URL(page.url()).pathname).toBe("/en/admin/orders");
  });

  test("any login reaches every section, from one navigation that marks the one on screen", async ({
    db,
    page,
  }) => {
    const admin = await signIn(page, await db.seed.createLogin());
    const links = admin.navigation().getByRole("link");

    // The eight sections, in order, for every login.
    await expect(links).toHaveCount(SECTIONS.length);

    for (const [index, [section]] of SECTIONS.entries()) {
      await expect(links.nth(index)).toHaveAttribute(
        "href",
        `/admin/${section}`
      );
    }

    for (const [section, heading] of SECTIONS) {
      await test.step(section, async () => {
        await admin.goto(`/admin/${section}`);

        await expect(admin.heading()).toHaveText(heading);
        await expect(admin.sectionLink(heading)).toHaveAttribute(
          "aria-current",
          "page"
        );
        // One list of sections: no store switcher, no platform area. The
        // orders add their own tabs, the metrics their ranges.
        const navigations = page.getByRole("navigation").filter({
          visible: true,
        });
        const OWN_NAVIGATION: Partial<Record<string, string>> = {
          metrics: "Período",
          orders: "Filtrar por estado",
        };
        const own = OWN_NAVIGATION[section];
        const names = own
          ? ["Secciones del panel", own]
          : ["Secciones del panel"];
        await expect(navigations).toHaveCount(names.length);

        for (const [index, name] of names.entries()) {
          await expect(navigations.nth(index)).toHaveAccessibleName(name);
        }
      });
    }
  });

  test("signing out ends the session: the admin asks to sign in again", async ({
    db,
    page,
  }) => {
    const admin = await signIn(page, await db.seed.createLogin());

    await admin.signOut();

    await page.goto("/admin/products");
    await new AdminSignInPage(page).waitForLoad();
    expect(new URL(page.url()).searchParams.get("next")).toBe(
      "/admin/products"
    );
  });
});

test.describe("Admin addresses of the multi-store site", () => {
  for (const path of [
    "/admin/lr-market",
    "/admin/lr-market/orders",
    "/admin/platform",
    "/admin/platform/stores",
  ]) {
    test(`a signed-in login opening ${path} gets the store's not-found page, not the admin`, async ({
      authenticatedPage: page,
    }) => {
      const store = new StorePage(page);

      const response = await page.goto(path);

      expect(response?.status()).toBe(404);
      await expect(store.getNotFoundHeading()).toBeVisible();
      await expect(page.getByTestId("admin-shell")).toHaveCount(0);
    });
  }
});

test.describe("Admin on a phone", () => {
  test.use({ viewport: { height: 812, width: 375 } });

  test("the shell fits 375 px: sections reachable from the menu, nothing scrolls sideways", async ({
    db,
    page,
  }) => {
    const admin = await signIn(page, await db.seed.createLogin());
    // The sidebar is behind the menu button on a phone.
    await expect(admin.navigation()).toHaveCount(0);

    await admin.openMenu();
    await expect(
      admin.menu().getByRole("img", { name: "LR Market" })
    ).toBeVisible();
    await expect(
      admin.menu().getByRole("button", { name: "Cerrar sesión" })
    ).toBeVisible();
    await admin.sectionLink("Categorías").click();

    await expect(admin.heading()).toHaveText("Categorías");
    await expect(admin.menu()).toHaveCount(0);
    await admin.expectNoHorizontalScroll();
  });
});
