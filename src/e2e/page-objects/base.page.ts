import { expect, type Locator, type Page } from "@playwright/test";

import { clickUntilVisible } from "../fixtures/click-until-visible";

export abstract class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  abstract goto(): Promise<void>;

  /** What this page shows once it rendered: the readiness signal. */
  protected abstract loaded(): Locator;

  /**
   * Waits for the page's own content, never for `networkidle`: an idle
   * network does not mean hydrated, and a page that polls never idles. Visible
   * is not hydrated either, so the first click after it goes through
   * `clickUntilVisible` or `completeRpcAction` (`../fixtures`).
   */
  async waitForLoad(): Promise<void> {
    await expect(this.loaded()).toBeVisible();
  }

  /** See {@link clickUntilVisible}: the first harmless open after a load. */
  protected async clickUntilVisible(
    trigger: Locator,
    ready: Locator
  ): Promise<void> {
    await clickUntilVisible(trigger, ready);
  }

  // ── Common UI Elements ──────────────────────────────────────

  getHeading(level: 1 | 2 | 3 = 1): Locator {
    return this.page.getByRole("heading", { level });
  }

  getButton(name: string | RegExp): Locator {
    // A string names the button exactly: "Post" must not match a row menu
    // named after a post.
    return this.page.getByRole("button", {
      exact: typeof name === "string",
      name,
    });
  }

  getLink(name: string | RegExp): Locator {
    return this.page.getByRole("link", { name });
  }

  getInput(label: string): Locator {
    // A required field's label ends in an aria-hidden "*", which Playwright
    // still reads; anchored, so "Password" never matches "Show password".
    return this.page.getByLabel(new RegExp(`^${label}\\*?$`));
  }

  getByTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  // ── Form Interactions ───────────────────────────────────────

  async fillField(label: string, value: string): Promise<void> {
    await this.getInput(label).fill(value);
  }

  async clearAndFill(label: string, value: string): Promise<void> {
    const input = this.getInput(label);
    await input.clear();
    await input.fill(value);
  }

  // ── Assertions ──────────────────────────────────────────────

  async expectHeading(text: string | RegExp): Promise<void> {
    await expect(this.page.getByRole("heading", { name: text })).toBeVisible();
  }

  async expectUrlContains(path: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(path));
  }

  async expectVisible(locator: Locator, timeout = 10_000): Promise<void> {
    await expect(locator).toBeVisible({ timeout });
  }

  async expectHidden(locator: Locator, timeout = 10_000): Promise<void> {
    await expect(locator).not.toBeVisible({ timeout });
  }
}
