import type { Locator } from "@playwright/test";

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

  /** Signs out; repeating the click is harmless until the sign-in shows. */
  async signOut(): Promise<void> {
    await this.clickUntilVisible(
      this.getButton("Cerrar sesión").filter({ visible: true }),
      this.getByTestId("admin-sign-in")
    );
  }
}
