import { expect, test } from "../../fixtures";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

test.describe("Sign Out", () => {
  test("signing out shows the sign-in form again", async ({
    freshAuthenticatedPage,
  }) => {
    const admin = new AdminPage(freshAuthenticatedPage);
    await admin.goto();

    await admin.signOut();

    const signIn = new AdminSignInPage(freshAuthenticatedPage);
    await expect(signIn.getInput("Email")).toBeVisible();
    await expect(signIn.getInput("Contraseña")).toBeVisible();
    await expect(signIn.submitButton()).toBeVisible();
  });
});
