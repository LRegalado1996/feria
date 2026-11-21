import { expect, type Locator } from "@playwright/test";

import {
  completeRpcAction,
  type RpcInput,
} from "../fixtures/complete-rpc-action";
import { expectDialogRemoved } from "../fixtures/expect-dialog-removed";
import { AdminPage } from "./admin.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/** The coming-soon page and its switch (`/admin/settings/coming-soon`, FER-034). */
export class AdminComingSoonPage extends AdminPage {
  /**
   * Opens the screen and waits until React owns it: its save button and its
   * switch are enabled only once the page hydrated.
   */
  async open(): Promise<void> {
    await this.goto("/admin/settings/coming-soon");
    await expect(this.heading()).toHaveText("Próximamente");
    await expect(this.saveButton()).toBeEnabled();
  }

  /** The screen's main action, in the top bar (under the thumb on a phone). */
  saveButton(): Locator {
    return this.getByTestId("admin-primary-action")
      .filter({ visible: true })
      .getByRole("button", { name: "Guardar textos" });
  }

  /** The switch's card. */
  status(): Locator {
    return this.getByTestId("coming-soon-status").filter({ visible: true });
  }

  /** The page's state in words: "Publicada" or "Sin publicar". */
  state(): Locator {
    return this.status().getByTestId("coming-soon-state");
  }

  /** The link that opens the page itself in a new tab. */
  previewLink(): Locator {
    return this.status().getByRole("link", { name: "Ver la página" });
  }

  /** A field of the form, by its exact name. */
  field(label: string): Locator {
    return this.getByTestId("coming-soon-form")
      .filter({ visible: true })
      .getByRole("textbox", { exact: true, name: label });
  }

  /** The countdown's day, a date input. */
  countdownField(): Locator {
    return this.getByTestId("coming-soon-form")
      .filter({ visible: true })
      .getByLabel("Cuenta los días hasta el");
  }

  /**
   * Saves, waiting for `comingSoon.update` to answer with the fields in
   * `input`, then for the screen to say it saved.
   */
  async save(input: RpcInput = {}): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/comingSoon/update",
      async () => {
        await this.saveButton().click();
      },
      { input }
    );
    await expect(this.page.getByText("Textos guardados.")).toBeVisible();
  }

  /** Publishes the page, through its confirmation, and waits for the answer. */
  async publish(): Promise<void> {
    await this.status()
      .getByRole("button", { name: "Publicar la página" })
      .click();
    const dialog = this.page.getByRole("dialog", {
      name: "¿Publicar la página de Próximamente?",
    });
    await expect(dialog).toBeVisible();
    await completeRpcAction(
      this.page,
      "/api/orpc/comingSoon/setPublished",
      async () => {
        await dialog.getByRole("button", { name: "Sí, publicar" }).click();
      },
      { input: { published: true } }
    );
    await expectDialogRemoved(this.page, dialog);
    await expect(this.state()).toHaveText("Publicada");
  }

  /** Takes the page down (no confirmation) and waits for the answer. */
  async unpublish(): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/comingSoon/setPublished",
      async () => {
        await this.status()
          .getByRole("button", { name: "Abrir la tienda" })
          .click();
      },
      { input: { published: false } }
    );
    await expect(this.state()).toHaveText("Sin publicar");
  }
}
