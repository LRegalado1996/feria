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

  /**
   * The document's `<link>` and `<meta>` tags, in order, each under the name
   * it declares (`rel`, `property` or `name`). Head tags have no role and no
   * test id to find them by, so they are read off the DOM.
   */
  async readHeadTags(): Promise<
    { content: string | null; href: string | null; key: string | null }[]
  > {
    return await this.page.evaluate(() =>
      [...document.head.children]
        .filter((element) => ["LINK", "META"].includes(element.tagName))
        .map((element) => ({
          content: element.getAttribute("content"),
          href: element.getAttribute("href"),
          key:
            element.getAttribute("rel") ??
            element.getAttribute("property") ??
            element.getAttribute("name"),
        }))
    );
  }

  /**
   * Where a `<link>` of the document points: the one with this `rel`, and
   * this `hreflang` when it has twins (the page in another language);
   * `null` when the document has none. Read off the DOM, like the rest of
   * the head: poll it when the page may still be arriving.
   */
  async readLinkHref(rel: string, hreflang?: string): Promise<string | null> {
    return await this.page.evaluate(
      ([wantedRel, wantedLang]) =>
        [...document.querySelectorAll("link")]
          .find(
            (link) =>
              link.getAttribute("rel") === wantedRel &&
              (wantedLang === undefined ||
                link.getAttribute("hreflang") === wantedLang)
          )
          ?.getAttribute("href") ?? null,
      [rel, hreflang] as const
    );
  }

  /**
   * The page's structured data: each JSON-LD block of the document, parsed,
   * in order. A script has no role and no test id either. Read through a
   * locator, so it works in a context that runs no script (a crawler's).
   */
  async readStructuredData(): Promise<unknown[]> {
    const blocks = await this.page
      .locator('script[type="application/ld+json"]')
      .allTextContents();

    return blocks.map((block): unknown => JSON.parse(block));
  }

  /** The document's language, which screen readers and search engines read. */
  async expectDocumentLanguage(lang: "en" | "es"): Promise<void> {
    await expect(this.page.locator("html")).toHaveAttribute("lang", lang);
  }

  /** The page is never wider than the window it is shown in. */
  async expectNoHorizontalScroll(): Promise<void> {
    await expect
      .poll(
        async () =>
          await this.page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
          )
      )
      .toBe(0);
  }

  // ── Common UI Elements ──────────────────────────────────────

  getHeading(level: 1 | 2 | 3 = 1): Locator {
    return this.page.getByRole("heading", { level });
  }

  getButton(name: string | RegExp): Locator {
    // A string names the button exactly: "Borrar" must not match a row's
    // "Borrar Anillos".
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
