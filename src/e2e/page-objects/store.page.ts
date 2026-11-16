import type { Locator, Page } from "@playwright/test";

import { BasePage } from "./base.page";

/** A store's public home, in that store's colors. */
export class StorePage extends BasePage {
  private readonly slug: string;

  constructor(page: Page, slug: string) {
    super(page);
    this.slug = slug;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/${this.slug}`);
    await this.waitForLoad();
  }

  async gotoEnglish(): Promise<void> {
    await this.page.goto(`/en/${this.slug}`);
    await this.waitForLoad();
  }

  protected loaded(): Locator {
    return this.getByTestId("store-home").filter({ visible: true }).first();
  }

  /** The element that carries the store's palette, painted in its background. */
  getTheme(): Locator {
    return this.getByTestId("store-theme");
  }

  /** The block the store's name sits on, in its contrast color. */
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
    return this.getByTestId("store-description");
  }
}
