import type { Browser, Page } from "@playwright/test";

import {
  expect,
  IGNORE_HTTPS_ERRORS,
  requireBaseURL,
  test,
  uniqueTag,
} from "../../fixtures";
import { AdminChangePasswordPage } from "../../page-objects/admin-change-password.page";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminUsersPage } from "../../page-objects/admin-users.page";
import { AdminPage } from "../../page-objects/admin.page";

// FER-015. The worker's own login manages the others; each test creates or
// seeds the logins it acts on, and teardown deletes them by their ids.

/**
 * A browser of its own, signed out, for the login being managed: it never
 * shares the worker's cookies. It creates no row teardown would have to find.
 */
async function signedOutPage(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({
    baseURL: requireBaseURL(baseURL),
    ignoreHTTPSErrors: IGNORE_HTTPS_ERRORS,
    storageState: { cookies: [], origins: [] },
  });

  return {
    close: async () => {
      await context.close();
    },
    page: await context.newPage(),
  };
}

async function signIn(
  page: Page,
  email: string,
  password: string,
  status = 200
) {
  const signInPage = new AdminSignInPage(page);
  await signInPage.goto();
  await signInPage.signIn(email, password, status);

  return signInPage;
}

test.describe("User management", () => {
  test("an admin creates a login, which signs in, changes its password and reaches the orders", async ({
    baseURL,
    browser,
    identity,
    page,
  }) => {
    const tag = uniqueTag();
    const login = {
      email: `e2e-new-${tag}@example.com`,
      name: `Nueva ${tag}`,
      password: `temporal-${tag.slice(0, 8)}`,
    };
    const users = new AdminUsersPage(page);
    await users.open();

    // The admin's own row offers nothing: nobody disables themselves.
    const own = users.row(identity.email);
    await expect(own).toContainText("Vos");
    await expect(own.getByRole("button")).toHaveCount(0);

    await users.createLogin(login);

    // Shown once, to send: the email and the temporary password.
    await expect(
      users.credentials().getByTestId("login-credentials-email")
    ).toHaveText(login.email);
    await expect(
      users.credentials().getByTestId("login-credentials-password")
    ).toHaveText(login.password);
    await users.closeSummary();
    await expect(
      users.row(login.email).getByTestId("login-temporary")
    ).toHaveText("Contraseña temporal");

    const newcomer = await signedOutPage(browser, baseURL);
    try {
      await signIn(newcomer.page, login.email, login.password);

      // Every admin page sends it to choose its own password first.
      const changePassword = new AdminChangePasswordPage(newcomer.page);
      await changePassword.waitForLoad();
      await expect(changePassword.getHeading()).toHaveText(
        "Cambiá tu contraseña"
      );
      await changePassword.change({
        currentPassword: login.password,
        forced: true,
        newPassword: `propia-${tag}`,
      });

      const admin = new AdminPage(newcomer.page);
      await admin.waitForLoad();
      await expect(admin.heading()).toHaveText("Pedidos");
      expect(new URL(newcomer.page.url()).pathname).toBe("/admin/orders");
    } finally {
      await newcomer.close();
    }

    await users.open();
    await expect(
      users.row(login.email).getByTestId("login-temporary")
    ).toHaveCount(0);
  });

  test("a disabled login cannot sign in, and says why", async ({
    baseURL,
    browser,
    db,
    page,
  }) => {
    const login = await db.seed.createLogin();
    const users = new AdminUsersPage(page);
    await users.open();

    await users.disable(login.email, login.name);

    await expect(users.row(login.email).getByTestId("login-status")).toHaveText(
      "Deshabilitado"
    );
    const visitor = await signedOutPage(browser, baseURL);
    try {
      const signInPage = await signIn(
        visitor.page,
        login.email,
        login.password,
        403
      );
      await signInPage.expectAuthError("Este usuario está deshabilitado.");
    } finally {
      await visitor.close();
    }
  });

  test("a reset password replaces the old one and must be changed at the next sign-in", async ({
    baseURL,
    browser,
    db,
    page,
  }) => {
    const login = await db.seed.createLogin();
    const temporary = `nueva-${uniqueTag().slice(0, 12)}`;
    const users = new AdminUsersPage(page);
    await users.open();

    await users.resetPassword(login.email, login.name, temporary);

    await expect(
      users.credentials().getByTestId("login-credentials-password")
    ).toHaveText(temporary);
    const visitor = await signedOutPage(browser, baseURL);
    try {
      const signInPage = await signIn(
        visitor.page,
        login.email,
        login.password,
        401
      );
      await signInPage.expectAuthError(
        "El email o la contraseña no son correctos."
      );

      await signIn(visitor.page, login.email, temporary);
      const changePassword = new AdminChangePasswordPage(visitor.page);
      await changePassword.waitForLoad();
      await expect(changePassword.getHeading()).toHaveText(
        "Cambiá tu contraseña"
      );
    } finally {
      await visitor.close();
    }
  });

  test("the superadmin's row offers another admin nothing to change, and says why", async ({
    db,
    page,
  }) => {
    const owner = await db.seed.createLogin({ role: "superadmin" });
    const users = new AdminUsersPage(page);
    await users.open();

    const row = users.row(owner.email);
    await expect(row.getByTestId("login-superadmin")).toHaveText("Superadmin");
    await expect(row.getByTestId("login-protected")).toHaveText(
      "Es el superadmin: nadie más lo puede deshabilitar ni cambiarle la contraseña."
    );
    await expect(row.getByRole("button")).toHaveCount(0);
  });

  test("a direct call to change the superadmin is refused", async ({
    db,
    page,
  }) => {
    const owner = await db.seed.createLogin({ role: "superadmin" });

    for (const [path, body] of [
      ["user/disable", { id: owner.id }],
      ["user/resetPassword", { id: owner.id, password: "taken-over-123" }],
    ] as const) {
      const response = await page.request.post(`/api/orpc/${path}`, {
        data: { json: body },
      });

      expect(response.status()).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        json: {
          message: "The superadmin's login cannot be changed by another login",
        },
      });
    }
  });

  test("Better Auth's own password change is closed: it changes only through the admin", async ({
    identity,
    page,
  }) => {
    const response = await page.request.post("/api/auth/change-password", {
      data: {
        currentPassword: identity.password,
        newPassword: "synthetic-e2e-taken-over-123",
      },
    });

    expect(response.status()).toBe(404);
  });
});
