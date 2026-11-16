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

  /**
   * Signs in through the form and waits for Better Auth's answer. The submit
   * button is enabled only once React owns the form, so typing waits for it.
   */
  async signIn(email: string, password: string): Promise<void> {
    const submit = this.getButton("Iniciar sesión");
    await expect(submit).toBeEnabled();
    await this.fillField("Email", email);
    await this.fillField("Contraseña", password);
    await completeRpcAction(
      this.page,
      "/api/auth/sign-in/email",
      async () => {
        await submit.click();
      },
      { input: { email } }
    );
  }
}
