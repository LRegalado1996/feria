import { expect, type Locator } from "@playwright/test";

import { expectDialogRemoved } from "../fixtures/expect-dialog-removed";
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

  /**
   * The header's cart once React owns it, when a click opens the side panel
   * (FER-045); before then it is a plain link to the checkout page. It says
   * it opens a dialog only from then on, so that is what this waits for.
   */
  async getLiveCartButton(): Promise<Locator> {
    const button = this.getCartButton();
    await expect(button).toHaveAttribute("aria-haspopup", "dialog", {
      timeout: 60_000,
    });

    return button;
  }

  /** The cart's side panel (FER-045), while it is open. */
  getCartPanel(): Locator {
    return this.getByTestId("store-cart-panel").filter({ visible: true });
  }

  /** A line of the open side panel, by its article's title. */
  getCartPanelLine(title: string): Locator {
    return this.getCartPanel()
      .getByTestId("store-cart-line")
      .filter({ hasText: title });
  }

  /**
   * Closes the side panel with "Seguir comprando" and waits for it and its
   * scrim to be gone: closed is not removed (`src/e2e/AGENTS.md`).
   */
  async closeCartPanel(): Promise<void> {
    const panel = this.getCartPanel();
    await panel.getByRole("button", { name: "Seguir comprando" }).click();
    await expectDialogRemoved(this.page, panel);
  }

  /**
   * The lime line above the header (FER-039): the fair and the stall until
   * FER-020, the whole notice from `lg` up and a short one on a phone.
   */
  getAnnouncementBar(): Locator {
    return this.getByTestId("store-announcement-bar").filter({
      visible: true,
    });
  }

  /** The bar's whole notice, in the HTML at every width. */
  getAnnouncementFull(): Locator {
    return this.getAnnouncementBar().getByTestId("store-announcement-bar-full");
  }

  /** The bar's phone version, for the eye only. */
  getAnnouncementShort(): Locator {
    return this.getAnnouncementBar().getByTestId(
      "store-announcement-bar-short"
    );
  }

  /**
   * How many lines the bar's words take on screen: the line boxes of the
   * version shown (the whole notice from `lg` up, the short one below).
   */
  async announcementLines(): Promise<number> {
    return await this.getAnnouncementBar().evaluate((bar) => {
      const shown = [...bar.querySelectorAll("span")].find(
        (span) => span.getClientRects().length > 0 && span.offsetWidth > 1
      );
      const rects = shown ? [...shown.getClientRects()] : [];

      return new Set(rects.map((rect) => Math.round(rect.top))).size;
    });
  }

  /**
   * The language pill, the header's from a tablet up or the phone menu's
   * once it is open; after a switch the page left behind stays mounted,
   * hidden, with a pill of its own.
   */
  getLocaleToggle(): Locator {
    return this.getByTestId("locale-toggle").filter({ visible: true });
  }

  /** The pill's thumb: `data-side` says which language it sits under. */
  getLocaleToggleThumb(): Locator {
    return this.getLocaleToggle().getByTestId("locale-toggle-thumb");
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
