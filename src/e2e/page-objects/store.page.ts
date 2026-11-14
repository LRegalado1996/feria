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
    return this.getByTestId("store-header");
  }

  getDescription(): Locator {
    return this.getByTestId("store-description");
  }
}
