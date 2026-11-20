import { expect, test } from "../../fixtures";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";
import { AdminPage } from "../../page-objects/admin.page";

const INVALID_CREDENTIALS_PATTERN = /no son correctos/i;
const MIN_PASSWORD_LENGTH_PATTERN = /8/;

// These start signed out; the worker's user is who signs in.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Sign In", () => {
  test("should display sign in form by default", async ({ page }) => {
    const signIn = new AdminSignInPage(page);
    await signIn.goto();

    await signIn.expectHeading("Panel de tu tienda");
    await expect(signIn.submitButton()).toBeVisible();
    await expect(signIn.getInput("Email")).toBeVisible();
    await expect(signIn.getInput("Contraseña")).toBeVisible();
  });

  test("should sign in with valid credentials", async ({ identity, page }) => {
    const signIn = new AdminSignInPage(page);
    await signIn.goto();

    await signIn.signIn(identity.email, identity.password);

    const admin = new AdminPage(page);
    await admin.waitForLoad();
    await expect(admin.getButton("Cerrar sesión")).toBeVisible();
  });

  test("should show error for wrong password", async ({ identity, page }) => {
    const signIn = new AdminSignInPage(page);
    await signIn.goto();

    await signIn.signIn(identity.email, "wrong-password", 401);

    await signIn.expectAuthError(INVALID_CREDENTIALS_PATTERN);
  });

  test("should show error for non-existent email", async ({ page }) => {
    const signIn = new AdminSignInPage(page);
    await signIn.goto();

    await signIn.signIn(
      `e2e-nobody-${crypto.randomUUID()}@example.com`,
      "some-password-123",
      401
    );

    await signIn.expectAuthError(INVALID_CREDENTIALS_PATTERN);
  });

  test("should show validation error for short password", async ({ page }) => {
    const signIn = new AdminSignInPage(page);
    await signIn.goto();

    await signIn.fillCredentials("test@example.com", "short");
    await signIn.submitButton().click();

    await signIn.expectFieldError(MIN_PASSWORD_LENGTH_PATTERN);
  });
});
