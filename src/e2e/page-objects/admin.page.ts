import { expect, type Locator } from "@playwright/test";

import { completeRpcAction } from "../fixtures/complete-rpc-action";
import { BasePage } from "./base.page";

// The admin reads in Spanish, the language of an unprefixed URL.

/** The phone menu's name, in either language. */
const MENU_NAME = /^Men[uú]$/u;

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

  /**
   * The phone's menu button in the page's top bar (FER-040), "Menú" or
   * "Menu" by the page's language. After a navigation the page left behind
   * stays mounted, hidden, with a button of its own: the visible one is the
   * one a user presses.
   */
  menuButton(): Locator {
    return this.page
      .getByRole("button", { name: MENU_NAME })
      .filter({ visible: true });
  }

  /** The menu panel the phone's menu button opens. */
  menu(): Locator {
    return this.page.getByRole("dialog", { name: MENU_NAME });
  }

  /** Opens the menu panel: the first harmless open after a load. */
  async openMenu(): Promise<void> {
    await this.clickUntilVisible(this.menuButton(), this.menu());
  }

  /**
   * The admin's one list of sections, the same for every login (FER-038):
   * the sidebar from `md` up, the menu panel once opened on a phone. After a
   * navigation the page left behind stays mounted, hidden, with a
   * navigation of its own: the visible one is the one a user reads.
   */
  navigation(): Locator {
    return this.page
      .getByRole("navigation", { name: "Secciones del panel" })
      .filter({ visible: true });
  }

  /**
   * A section's link in the navigation, by its label. The orders' link adds
   * how many are still to pack to its name, so the name is matched from its
   * start.
   */
  sectionLink(label: string): Locator {
    return this.navigation().getByRole("link", {
      name: new RegExp(`^${label}`, "u"),
    });
  }

  /**
   * The link to this page in the other language. After a switch the page
   * left behind stays mounted, hidden, with a toggle of its own: the visible
   * one is the one a user presses.
   */
  localeToggle(): Locator {
    return this.getByTestId("locale-toggle").filter({ visible: true });
  }

  /** The toggle's thumb: `data-side` says which language it sits under. */
  localeToggleThumb(): Locator {
    return this.localeToggle().getByTestId("locale-toggle-thumb");
  }

  async chooseTheme(theme: "Claro" | "Oscuro" | "Sistema"): Promise<void> {
    // Right after a reload the streamed page can briefly hold a second,
    // hidden copy of the shell; the visible one is the one a user presses.
    const option = this.page.getByRole("menuitemradio", { name: theme });
    await this.clickUntilVisible(
      this.getByTestId("theme-toggle").filter({ visible: true }),
      option
    );
    await option.click();
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
