import { expect, type Locator } from "@playwright/test";

import { clickUntilVisible } from "../fixtures/click-until-visible";
import {
  completeRpcAction,
  type RpcInput,
} from "../fixtures/complete-rpc-action";
import { AdminPage } from "./admin.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/**
 * The store's pages (`/admin/pages`, FER-060) and, in a page's editor
 * (`/admin/pages/<id>`), its settings card and its "Agregar bloque".
 */
export class AdminPagesPage extends AdminPage {
  /** Opens the list and waits until it is drawn. */
  async open(): Promise<void> {
    await this.goto("/admin/pages");
    await expect(this.heading()).toHaveText("Páginas");
    await expect(this.getByTestId("page-list")).toBeVisible();
  }

  /** A page's row in the list, by its name (its edit link's). */
  row(name: string): Locator {
    return this.getByTestId("page-row").filter({
      has: this.page.getByRole("link", {
        exact: true,
        name: `Editar: ${name}`,
      }),
    });
  }

  /** The side sheet "Nueva página" opens. */
  sheet(): Locator {
    return this.getByTestId("page-sheet");
  }

  /** Opens "Nueva página", repeated until React owns the button. */
  async openNewPage(): Promise<void> {
    await clickUntilVisible(this.getByTestId("page-add"), this.sheet());
  }

  /**
   * Creates the page the sheet holds, waiting for `page.create` to answer
   * with `input`, then for its editor to open.
   */
  async createPage(input: RpcInput = {}): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/page/create",
      async () => {
        await this.sheet().getByTestId("page-form-submit").click();
      },
      { input }
    );
    await expect(this.page).toHaveURL(/\/admin\/pages\/\d+$/u);
  }

  /**
   * Makes the page `name` the home, through its question: the question's
   * first open after a load is repeated until React owns the button.
   */
  async useAsHome(name: string): Promise<void> {
    const dialog = this.page.getByRole("dialog");
    await clickUntilVisible(
      this.row(name).getByRole("button", { name: `Usar como home: ${name}` }),
      dialog
    );
    await completeRpcAction(this.page, "/api/orpc/page/setHome", async () => {
      await dialog.getByRole("button", { name: "Usar como home" }).click();
    });
    await expect(this.page.getByText(`«${name}» es la home.`)).toBeVisible();
  }

  /** The settings card of a page's editor. */
  settings(): Locator {
    return this.getByTestId("page-settings");
  }

  /** Saves the settings card, waiting for `page.update` to answer. */
  async saveSettings(input: RpcInput = {}): Promise<void> {
    await completeRpcAction(
      this.page,
      "/api/orpc/page/update",
      async () => {
        await this.settings().getByTestId("page-form-submit").click();
      },
      { input }
    );
    await expect(this.page.getByText("Ajustes guardados.")).toBeVisible();
  }

  /** Adds the block named `name` at the end of the page's order. */
  async addBlock(name: string): Promise<void> {
    const add = this.getByTestId("page-add-block");
    await add
      .getByRole("combobox", { name: "Bloque para agregar" })
      .selectOption({ label: name });
    await add.getByRole("button", { name: "Agregar bloque" }).click();
  }
}
