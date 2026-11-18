import { expect, type Locator } from "@playwright/test";

import {
  completeRpcAction,
  type RpcInput,
} from "../fixtures/complete-rpc-action";
import { AdminPage } from "./admin.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/** The company's settings (`/admin/settings`, FER-014). */
export class AdminSettingsPage extends AdminPage {
  /**
   * Opens the screen and waits until React owns it: its save button is
   * enabled only once the page hydrated.
   */
  async open(): Promise<void> {
    await this.goto("/admin/settings");
    await expect(this.heading()).toHaveText("Ajustes");
    await expect(this.saveButton()).toBeEnabled();
  }

  /** The screen's main action, in the top bar (under the thumb on a phone). */
  saveButton(): Locator {
    return this.getByTestId("admin-primary-action")
      .filter({ visible: true })
      .getByRole("button", { name: "Guardar" });
  }

  /**
   * A field of the form, by its exact name: by role, since a required
   * field's label also holds an asterisk that is no part of its name.
   */
  field(label: string): Locator {
    return this.getByTestId("settings-form").getByRole("textbox", {
      exact: true,
      name: label,
    });
  }

  /**
   * Saves, waiting for `store.update` to answer with the fields in `input`,
   * then for the screen to say it saved.
   */
  async save(input: RpcInput = {}): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/store/update",
      async () => {
        await this.saveButton().click();
      },
      { input }
    );
    await expect(this.page.getByText("Ajustes guardados.")).toBeVisible();
  }
}
