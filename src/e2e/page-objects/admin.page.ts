import { expect, type Locator } from "@playwright/test";

import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { BasePage } from "./base.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/** Any page inside the admin shell. */
export class AdminPage extends BasePage {
  async goto(path = "/admin"): Promise<void> {
    await this.page.goto(path);
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.getByTestId("admin-shell").filter({ visible: true }).first();
  }

  heading(): Locator {
    return this.page
      .getByRole("heading", { level: 1 })
      .filter({ visible: true });
  }

  storeNavigation(): Locator {
    return this.page.getByRole("navigation", { name: "Secciones del panel" });
  }

  platformNavigation(): Locator {
    return this.page.getByRole("navigation", {
      name: "Secciones de la plataforma",
    });
  }

  /** Signs out once, waiting for Better Auth's answer, then the sign-in. */
  async signOut(): Promise<void> {
    const button = this.getButton("Cerrar sesión").filter({ visible: true });
    // Enabled only once React owns it: a click before that would be lost.
    await expect(button).toBeEnabled();
    await completeRpcAction(this.page, "/api/auth/sign-out", async () => {
      await button.click();
    });
    await expect(this.getByTestId("admin-sign-in")).toBeVisible();
  }
}
