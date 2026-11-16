import { expect, type Locator } from "@playwright/test";

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

  /** The home's intro, where the store's name sits on the white page. */
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

  /** The lime line above the header, with the store's tagline (FER-039). */
  getAnnouncementBar(): Locator {
    return this.getByTestId("store-announcement-bar").filter({
      visible: true,
    });
  }

  /** The header's search icon, which opens the search panel. */
  getSearchButton(): Locator {
    return this.getByTestId("store-search-button").filter({ visible: true });
  }

  /**
   * The search icon once React owns it, ready to open the dialog. Before
   * then it opens the browser's own plain panel, which covers the header
   * until it is closed; the icon drops its `popovertarget` when React takes
   * over, so that is what this waits for.
   */
  async getLiveSearchButton(): Promise<Locator> {
    const button = this.getSearchButton();
    await this.expectVisible(button, 60_000);
    await expect(button).not.toHaveAttribute("popovertarget", {
      timeout: 60_000,
    });

    return button;
  }

  /** The dark panel under the header, with the one search field. */
  getSearchPanel(): Locator {
    return this.getByTestId("store-search-panel").filter({ visible: true });
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
