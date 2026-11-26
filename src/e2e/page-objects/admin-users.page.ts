import { expect, type Locator } from "@playwright/test";

import { clickUntilVisible } from "../fixtures/click-until-visible";
import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../fixtures/expect-dialog-removed";
import { AdminPage } from "./admin.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/** The store's logins (`/admin/users`, FER-015). */
export class AdminUsersPage extends AdminPage {
  /** Opens the list and waits until it is drawn. */
  async open(): Promise<void> {
    await this.goto("/admin/users");
    await expect(this.heading()).toHaveText("Usuarios");
    await expect(this.getByTestId("login-list")).toBeVisible();
  }

  /** A login's row, by its email, which no other login has. */
  row(email: string): Locator {
    return this.getByTestId("login-row").filter({ hasText: email });
  }

  /** The side sheet "Nuevo usuario" and "Restablecer contraseña" open. */
  sheet(): Locator {
    return this.getByTestId("login-sheet");
  }

  /** Creates a login through the sheet, waiting for `user.create`. */
  async createLogin(login: {
    email: string;
    name: string;
    password: string;
  }): Promise<void> {
    await clickUntilVisible(this.getByTestId("login-add"), this.sheet());
    const sheet = this.sheet();
    await sheet.getByLabel(/^Nombre\*?$/u).fill(login.name);
    await sheet.getByLabel(/^Email\*?$/u).fill(login.email);
    await sheet.getByLabel(/^Contraseña temporal\*?$/u).fill(login.password);
    await completeRpcAction(
      this.page,
      "/api/orpc/user/create",
      async () => {
        await sheet.getByTestId("login-form-submit").click();
      },
      { input: { email: login.email, name: login.name } }
    );
  }

  /** Gives `email`'s login a new temporary password through the sheet. */
  async resetPassword(email: string, name: string, password: string) {
    await this.row(email)
      .getByRole("button", { name: `Restablecer contraseña: ${name}` })
      .click();
    const sheet = this.sheet();
    await sheet.getByLabel(/^Contraseña temporal\*?$/u).fill(password);
    await completeRpcAction(
      this.page,
      "/api/orpc/user/resetPassword",
      async () => {
        await sheet.getByTestId("reset-password-submit").click();
      },
      { input: { password } }
    );
  }

  /** What the sheet says to send, once a password was saved. */
  credentials(): Locator {
    return this.sheet().getByTestId("login-credentials");
  }

  /** Closes the summary with "Listo". */
  async closeSummary(): Promise<void> {
    await this.sheet().getByRole("button", { name: "Listo" }).click();
    await expectDialogRemoved(this.page, this.sheet());
  }

  /** Disables `email`'s login, confirming, and waits for `user.disable`. */
  async disable(email: string, name: string): Promise<void> {
    await this.row(email)
      .getByRole("button", { name: `Deshabilitar: ${name}` })
      .click();
    const dialog = this.getByTestId("confirm-dialog");
    await completeRpcAction(this.page, "/api/orpc/user/disable", async () => {
      await dialog.getByTestId("confirm-dialog-confirm").click();
    });
    await expectDialogRemoved(this.page, dialog);
  }
}
