import { expect, test } from "../../fixtures";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

// FER-013. Each test starts signed out and signs in as a login it seeds.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Admin sign-in and landing", () => {
  test("an anonymous visit ends at sign-in and comes back to the page asked for", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore({ name: "Tienda Pedidos" });
    const login = await db.seed.createLogin({
      role: "member",
      storeIds: [store.id],
    });
    const signIn = new AdminSignInPage(page);

    await page.goto(`/admin/${store.slug}/orders`);
    await signIn.waitForLoad();
    expect(new URL(page.url()).searchParams.get("next")).toBe(
      `/admin/${store.slug}/orders`
    );

    await signIn.signIn(login.email, login.password);

    const admin = new AdminPage(page);
    await admin.waitForLoad();
    await expect(admin.heading()).toHaveText("Pedidos");
    expect(new URL(page.url()).pathname).toBe(`/admin/${store.slug}/orders`);
  });

  test("a superadmin lands in the platform area, with both navigations", async ({
    db,
    page,
  }) => {
    const login = await db.seed.createLogin({ role: "superadmin" });
    const signIn = new AdminSignInPage(page);
    await signIn.goto();

    await signIn.signIn(login.email, login.password);

    const admin = new AdminPage(page);
    await admin.waitForLoad();
    await expect(admin.heading()).toHaveText("Tiendas");
    await expect(admin.platformNavigation()).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/admin/platform/stores");
  });

  test("a member of one store goes straight to it, and never sees the platform", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore({ name: "Tienda Única" });
    const login = await db.seed.createLogin({
      role: "member",
      storeIds: [store.id],
    });
    const signIn = new AdminSignInPage(page);
    await signIn.goto();

    await signIn.signIn(login.email, login.password);

    const admin = new AdminPage(page);
    await admin.waitForLoad();
    await expect(admin.heading()).toHaveText("Artículos");
    expect(new URL(page.url()).pathname).toBe(`/admin/${store.slug}/products`);
    await expect(admin.storeNavigation()).toBeVisible();
    await expect(admin.platformNavigation()).toHaveCount(0);
  });

  test("a member of several stores picks one", async ({ db, page }) => {
    const first = await db.seed.createStore({ name: "Primera Tienda" });
    const second = await db.seed.createStore({ name: "Segunda Tienda" });
    const login = await db.seed.createLogin({
      role: "member",
      storeIds: [first.id, second.id],
    });
    const signIn = new AdminSignInPage(page);
    await signIn.goto();

    await signIn.signIn(login.email, login.password);

    const admin = new AdminPage(page);
    await admin.waitForLoad();
    await expect(admin.heading()).toHaveText("Elegí una tienda");
    const choice = page
      .getByTestId("admin-store-picker")
      .getByRole("link", { name: "Segunda Tienda" });
    await expect(choice).toHaveAttribute(
      "href",
      `/admin/${second.slug}/products`
    );

    await choice.click();

    await expect(admin.heading()).toHaveText("Artículos");
    expect(new URL(page.url()).pathname).toBe(`/admin/${second.slug}/products`);
  });

  test("signing out ends the session: the admin asks to sign in again", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore();
    const login = await db.seed.createLogin({
      role: "member",
      storeIds: [store.id],
    });
    const signIn = new AdminSignInPage(page);
    await signIn.goto();
    await signIn.signIn(login.email, login.password);
    const admin = new AdminPage(page);
    await admin.waitForLoad();

    await admin.signOut();

    await page.goto(`/admin/${store.slug}/products`);
    await signIn.waitForLoad();
  });
});

test.describe("Admin authorization", () => {
  test("a member typing a platform address gets the not-found page", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore();
    const login = await db.seed.createLogin({
      role: "member",
      storeIds: [store.id],
    });
    const signIn = new AdminSignInPage(page);
    await signIn.goto();
    await signIn.signIn(login.email, login.password);
    await new AdminPage(page).waitForLoad();

    await page.goto("/admin/platform/stores");

    await expect(
      page.getByRole("heading", { name: "Página no encontrada" })
    ).toBeVisible();
    await expect(page.getByTestId("admin-shell")).toHaveCount(0);
  });

  test("a member typing another store's admin gets the not-found page", async ({
    db,
    page,
  }) => {
    const own = await db.seed.createStore();
    const other = await db.seed.createStore();
    const login = await db.seed.createLogin({
      role: "member",
      storeIds: [own.id],
    });
    const signIn = new AdminSignInPage(page);
    await signIn.goto();
    await signIn.signIn(login.email, login.password);
    await new AdminPage(page).waitForLoad();

    await page.goto(`/admin/${other.slug}/products`);

    await expect(
      page.getByRole("heading", { name: "Página no encontrada" })
    ).toBeVisible();
  });
});

test.describe("Admin on a phone", () => {
  test.use({ viewport: { height: 812, width: 375 } });

  test("the shell fits 375 px: sections reachable, nothing scrolls sideways", async ({
    db,
    page,
  }) => {
    const store = await db.seed.createStore({ name: "Tienda del Puesto" });
    const login = await db.seed.createLogin({
      role: "member",
      storeIds: [store.id],
    });
    const signIn = new AdminSignInPage(page);
    await signIn.goto();
    await signIn.signIn(login.email, login.password);
    const admin = new AdminPage(page);
    await admin.waitForLoad();

    await admin
      .storeNavigation()
      .getByRole("link", { name: "Pedidos" })
      .click();

    await expect(admin.heading()).toHaveText("Pedidos");
    await expect(
      page.getByRole("button", { name: "Cerrar sesión" })
    ).toBeVisible();
    await expect(
      page.getByRole("banner").getByText("Tienda del Puesto")
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
  });
});
