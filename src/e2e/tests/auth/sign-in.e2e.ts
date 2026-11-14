import { expect, test } from "../../fixtures";
import { HomePage } from "../../page-objects/home.page";

const INVALID_CREDENTIALS_PATTERN = /no son correctos/i;
const MIN_PASSWORD_LENGTH_PATTERN = /8/;

// These start signed out; the worker's user is who signs in.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Sign In", () => {
  test("should display sign in form by default", async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.expectUnauthenticated();
    await expect(homePage.getButton("Iniciar sesión")).toBeVisible();
    await expect(homePage.getInput("Email")).toBeVisible();
    await expect(homePage.getInput("Contraseña")).toBeVisible();
  });

  test("should sign in with valid credentials", async ({ identity, page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.signIn(identity.email, identity.password);

    await homePage.expectAuthenticated(identity.name);
  });

  test("should show error for wrong password", async ({ identity, page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.signIn(identity.email, "wrong-password", 401);

    await homePage.expectAuthError(INVALID_CREDENTIALS_PATTERN);
  });

  test("should show error for non-existent email", async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.signIn(
      `e2e-nobody-${crypto.randomUUID()}@example.com`,
      "some-password-123",
      401
    );

    await homePage.expectAuthError(INVALID_CREDENTIALS_PATTERN);
  });

  test("should show validation error for short password", async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.waitForAuthForm();
    await homePage.fillEmail("test@example.com");
    await homePage.fillPassword("short");
    await homePage.submitSignIn();

    await homePage.expectFieldError(MIN_PASSWORD_LENGTH_PATTERN);
  });
});
