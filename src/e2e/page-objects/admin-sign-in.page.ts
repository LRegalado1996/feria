import { expect, type Locator } from "@playwright/test";

import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { BasePage } from "./base.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/** The admin's sign-in page (`/admin/sign-in`). */
export class AdminSignInPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto("/admin/sign-in");
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.getByTestId("admin-sign-in");
  }

  submitButton(): Locator {
    return this.getButton("Iniciar sesión");
  }

  /**
   * The submit button stays disabled until React owns the form, so it being
   * enabled is the proof that typing and submitting now reach React.
   */
  async waitForForm(): Promise<void> {
    await expect(this.submitButton()).toBeEnabled();
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.waitForForm();
    await this.fillField("Email", email);
    await this.fillField("Contraseña", password);
  }

  /**
   * Signs in through the form and waits for Better Auth's answer, `status`
   * (200 by default). A submit is never retried: a lost one fails here, at
   * the request.
   */
  async signIn(email: string, password: string, status = 200): Promise<void> {
    await this.fillCredentials(email, password);
    await completeRpcAction(
      this.page,
      "/api/auth/sign-in/email",
      async () => {
        await this.submitButton().click();
      },
      { input: { email }, status }
    );
  }

  async expectAuthError(message: string | RegExp): Promise<void> {
    await expect(this.getByTestId("auth-error")).toContainText(message);
  }

  async expectFieldError(message: string | RegExp): Promise<void> {
    await expect(
      this.getByTestId("form-message").getByText(message)
    ).toBeVisible();
  }
}
