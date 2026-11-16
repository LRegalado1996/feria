import type { Locator } from "@playwright/test";

import { BasePage } from "./base.page";

/**
 * The store's home (`/`, English at `/en`), in the theme's colors: the site
 * is one store (FER-038). Its header and footer are on every store page.
 */
export class StorePage extends BasePage {
  async goto(): Promise<void> {
    await this.page.goto("/");
    await this.waitForLoad();
  }

  async gotoEnglish(): Promise<void> {
    await this.page.goto("/en");
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.getByTestId("store-home").filter({ visible: true }).first();
  }

  /** The canvas every store page is painted on, in the theme's background. */
  getTheme(): Locator {
    return this.getByTestId("store-theme");
  }

  /** The block the store's name sits on, in the theme's contrast color. */
  getHeader(): Locator {
    return this.getByTestId("store-intro-header").filter({ visible: true });
  }

  /** The header every page of the store starts with (FER-021). */
  getSiteHeader(): Locator {
    return this.getByTestId("store-header").filter({ visible: true });
  }

  getFooter(): Locator {
    return this.getByTestId("store-footer").filter({ visible: true });
  }

  /** The cart's link in the header, named after its count. */
  getCartButton(): Locator {
    return this.getByTestId("store-cart-button").filter({ visible: true });
  }

  /** The phone menu's button, by its name in the page's language. */
  getMenuButton(name: string): Locator {
    return this.page.getByRole("button", { name });
  }

  getMobileMenu(): Locator {
    return this.getByTestId("store-mobile-menu").filter({ visible: true });
  }

  getDescription(): Locator {
    return this.getByTestId("store-description").filter({ visible: true });
  }

  /**
   * The store's not-found page (`(store)/not-found.tsx`), under the store's
   * header: every address no page answers, an old one included.
   */
  getNotFoundHeading(): Locator {
    return this.page.getByRole("heading", {
      level: 1,
      name: "No encontramos esta página",
    });
  }
}
