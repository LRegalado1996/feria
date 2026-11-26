import { expect, type Locator } from "@playwright/test";

import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { BasePage } from "./base.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/** Where a login chooses its own password (`/admin/change-password`). */
export class AdminChangePasswordPage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto("/admin/change-password");
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.getByTestId("admin-change-password");
  }

  submitButton(): Locator {
    return this.getByTestId("change-password-submit");
  }

  /**
   * Chooses `newPassword`, knowing `currentPassword` (the temporary one when
   * `forced`), and waits for `admin.changePassword`. The submit button is
   * enabled only once React owns the form.
   */
  async change({
    currentPassword,
    forced,
    newPassword,
  }: {
    currentPassword: string;
    forced: boolean;
    newPassword: string;
  }): Promise<void> {
    await expect(this.submitButton()).toBeEnabled();
    await this.fillField(
      forced ? "Contraseña temporal" : "Contraseña actual",
      currentPassword
    );
    await this.fillField("Contraseña nueva", newPassword);
    await this.fillField("Repetí la contraseña nueva", newPassword);
    await completeRpcAction(
      this.page,
      "/api/orpc/admin/changePassword",
      async () => {
        await this.submitButton().click();
      },
      { input: { currentPassword, newPassword } }
    );
  }
}
