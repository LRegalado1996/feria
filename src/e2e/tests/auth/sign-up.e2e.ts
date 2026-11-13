import { expect, test } from "../../fixtures";
import { HomePage } from "../../page-objects/home.page";

const EMAIL_EXISTS_PATTERN = /Ya existe una cuenta/i;
const MIN_NAME_LENGTH_PATTERN = /2/;

// These start signed out. A user signed up here is deleted at teardown (the
// fixtures read its id off the sign-up response).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Sign Up", () => {
  test("should display sign up form when toggling mode", async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.switchToSignUp();

    await expect(homePage.getButton("Crear cuenta")).toBeVisible();
    await expect(homePage.getInput("Nombre")).toBeVisible();
    await expect(homePage.getInput("Email")).toBeVisible();
    await expect(homePage.getInput("Contraseña")).toBeVisible();
  });

  test("should sign up with valid credentials", async ({ page }) => {
    const uniqueEmail = `e2e-signup-${crypto.randomUUID()}@example.com`;
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.signUp("New User", uniqueEmail, "secure-password-123");

    await homePage.expectAuthenticated("New User");
  });

  test("should show error when email already exists", async ({
    identity,
    page,
  }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.signUp(
      "Duplicate User",
      identity.email,
      "another-password-123",
      422
    );

    await homePage.expectAuthError(EMAIL_EXISTS_PATTERN);
  });

  test("should show validation error for short name", async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.switchToSignUp();
    await homePage.fillName("A");
    await homePage.fillEmail("newuser@example.com");
    await homePage.fillPassword("valid-password-123");
    await homePage.submitSignUp();

    await homePage.expectFieldError(MIN_NAME_LENGTH_PATTERN);
  });

  test("should toggle back to sign in mode", async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();

    await homePage.switchToSignUp();
    await expect(homePage.getInput("Nombre")).toBeVisible();

    await homePage.switchToSignIn();
    await expect(homePage.getInput("Nombre")).not.toBeVisible();
    await expect(homePage.getButton("Iniciar sesión")).toBeVisible();
  });
});
