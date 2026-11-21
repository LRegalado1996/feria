import { expect, test } from "../../fixtures";
import { AdminSignInPage } from "../../page-objects/admin-sign-in.page";

// Sign-up is closed (FER-009): logins are created by a superadmin or a store
// member, never by a visitor. These start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Closed sign-up", () => {
  test("the sign-in form offers no way to create an account", async ({
    page,
  }) => {
    const signIn = new AdminSignInPage(page);
    await signIn.goto();
    await signIn.waitForForm();

    await expect(signIn.getInput("Email")).toBeVisible();
    await expect(signIn.getInput("Contraseña")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Nombre" })).toHaveCount(0);
    await expect(page.getByText("Registrate")).toHaveCount(0);
  });

  test("the sign-up endpoint answers 404 when called directly", async ({
    page,
  }) => {
    const response = await page.request.post("/api/auth/sign-up/email", {
      data: {
        email: `e2e-signup-${crypto.randomUUID()}@example.com`,
        name: "Should Not Exist",
        password: "secure-password-123",
      },
    });

    expect(response.status()).toBe(404);
  });
});
